/**
 * One-way Canvas → Erwin Task upsert. Read-only relative to Canvas.
 */

import type { CanvasAssignment, CanvasAssignmentGroup } from "@/lib/canvas/types";
import { createCanvasClient } from "@/lib/canvas/canvas-client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "CanvasSync";

function estimateDurationMinutes(types: string[] | undefined): number {
  if (!types?.length) {
    return 30;
  }
  if (types.includes("online_quiz")) {
    return 20;
  }
  if (types.includes("discussion_topic")) {
    return 25;
  }
  if (types.includes("online_upload")) {
    return 45;
  }
  return 30;
}

function computeGradeImpactRaw(params: {
  points: number | null | undefined;
  maxInGroup: number;
  groupWeightPercent: number | null | undefined;
  omitFromFinalGrade: boolean;
  gradingType: string | null | undefined;
}): number {
  const {
    points,
    maxInGroup,
    groupWeightPercent,
    omitFromFinalGrade,
    gradingType,
  } = params;

  let base = 0;
  const pts = points ?? 0;

  if (pts === 0) {
    base = 0.15;
  } else if (maxInGroup > 0 && groupWeightPercent != null && groupWeightPercent > 0) {
    base = (pts / maxInGroup) * (groupWeightPercent / 100);
  } else if (pts > 0) {
    base = Math.min(1, pts / 100);
  } else {
    base = 0.1;
  }

  if (omitFromFinalGrade) {
    base *= 0.3;
  }
  if (gradingType === "not_graded") {
    base = Math.max(base * 0.5, 0.1);
  }
  return Math.min(1, base);
}

function mapStatusFromSubmission(
  assignment: CanvasAssignment
): { taskStatus: string; submissionStatus: string | null } {
  const sub = assignment.submission;
  const ws = sub?.workflow_state;

  if (ws === "graded" || ws === "submitted") {
    return { taskStatus: "completed", submissionStatus: ws };
  }
  if (ws === "unsubmitted" || ws === "pending_review") {
    return { taskStatus: "todo", submissionStatus: ws };
  }
  if (assignment.has_submitted_submissions) {
    return { taskStatus: "completed", submissionStatus: "submitted" };
  }
  return { taskStatus: "todo", submissionStatus: ws ?? "unsubmitted" };
}

function maxPointsInGroup(
  assignments: CanvasAssignment[],
  groupId: number | null
): number {
  if (groupId == null) {
    return 0;
  }
  let max = 0;
  for (const a of assignments) {
    if (a.assignment_group_id === groupId) {
      const p = a.points_possible ?? 0;
      if (p > max) {
        max = p;
      }
    }
  }
  return max || 1;
}

/**
 * Pulls active courses and assignments from Canvas and upserts rows in `Task` for the user.
 */
export async function syncCanvasTasksForUser(userId: string): Promise<{
  upserted: number;
  courseCount: number;
}> {
  const provider = await prisma.taskProvider.findFirst({
    where: { userId, type: "CANVAS" },
  });

  if (!provider?.accessToken || !provider.serverUrl) {
    throw new Error("Canvas provider is not configured (missing token or base URL)");
  }

  const client = createCanvasClient({
    baseUrl: provider.serverUrl,
    accessToken: provider.accessToken,
  });

  const courses = await client.listActiveCourses();
  let upserted = 0;

  for (const course of courses) {
    const groups = await client.listAssignmentGroups(course.id);
    const groupById = new Map<number, CanvasAssignmentGroup>();
    for (const g of groups) {
      groupById.set(g.id, g);
    }

    const assignments = await client.listAssignments(course.id);

    for (const a of assignments) {
      const gid = a.assignment_group_id ?? null;
      const group = gid != null ? groupById.get(gid) : undefined;
      const maxPts = maxPointsInGroup(assignments, gid);
      const weight = group?.group_weight ?? null;

      const gradeImpactScore = computeGradeImpactRaw({
        points: a.points_possible,
        maxInGroup: maxPts,
        groupWeightPercent: weight,
        omitFromFinalGrade: Boolean(a.omit_from_final_grade),
        gradingType: a.grading_type,
      });

      const { taskStatus, submissionStatus } = mapStatusFromSubmission(a);
      const extId = String(a.id);

      // todo: apply assignment group drop_lowest rules when adjusting gradeImpactScore (spec §5.2.7 / §8.1)
      // todo: normalize gradeImpactScore across all pending tasks in pool after full sync (spec §5.2.3)

      const payload = {
        title: a.name,
        description: a.description ?? null,
        status: taskStatus,
        dueDate: a.due_at ? new Date(a.due_at) : null,
        lockAt: a.lock_at ? new Date(a.lock_at) : null,
        unlockAt: a.unlock_at ? new Date(a.unlock_at) : null,
        duration: estimateDurationMinutes(a.submission_types),
        source: "CANVAS",
        externalTaskId: extId,
        lastSyncedAt: new Date(),
        syncStatus: "SYNCED",
        userId,
        taskProviderId: provider.id,
        gradeImpactScore,
        courseId: String(course.id),
        courseName: course.name,
        assignmentGroupName: group?.name ?? null,
        pointsPossible: a.points_possible ?? null,
        groupWeight: weight,
        submissionTypes: a.submission_types
          ? (JSON.parse(JSON.stringify(a.submission_types)) as object)
          : undefined,
        gradingType: a.grading_type ?? null,
        submissionStatus,
        omitFromFinalGrade: Boolean(a.omit_from_final_grade),
        category: "SCHOOL",
        externalUrl: a.html_url ?? null,
        urgencyTier: "NONE",
      };

      const existing = await prisma.task.findFirst({
        where: {
          userId,
          taskProviderId: provider.id,
          externalTaskId: extId,
        },
      });

      if (existing) {
        await prisma.task.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await prisma.task.create({
          data: payload,
        });
      }
      upserted += 1;
    }
  }

  await prisma.taskProvider.update({
    where: { id: provider.id },
    data: {
      lastSyncedAt: new Date(),
      error: null,
    },
  });

  logger.info(
    "Canvas sync completed",
    { userId, upserted, courseCount: courses.length },
    LOG_SOURCE
  );

  return { upserted, courseCount: courses.length };
}
