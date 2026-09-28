/**
 * One-way Canvas → Erwin Task upsert. Read-only relative to Canvas.
 */

import type {
  CanvasAssignment,
  CanvasAssignmentGroup,
  CanvasCourse,
} from "@/lib/canvas/types";
import { createCanvasClient } from "@/lib/canvas/canvas-client";
import {
  hasLiveAssignment,
  isTermNamedCourse,
} from "@/lib/canvas/course-term-filter";
import {
  type MaterialsSyncStats,
  syncCanvasMaterials,
} from "@/lib/canvas/sync-canvas-materials";
import { Prisma } from "@prisma/client";
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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns true if this assignment should be skipped during sync.
 * isNew = true when no existing DB row found for this assignment.
 */
function shouldSkipAssignment(
  a: CanvasAssignment,
  now: Date,
  isNew: boolean
): boolean {
  // Skip assignments that unlock more than 7 days from now
  if (a.unlock_at && new Date(a.unlock_at).getTime() - now.getTime() > SEVEN_DAYS_MS) {
    return true;
  }
  // Skip zero-credit surveys/optionals
  if (Boolean(a.omit_from_final_grade) && (a.points_possible ?? 0) === 0) {
    return true;
  }
  // Don't create new tasks for already-submitted assignments; existing tasks get updated to completed
  if (isNew) {
    const ws = a.submission?.workflow_state;
    if (ws === "graded" || ws === "submitted" || a.has_submitted_submissions) {
      return true;
    }
  }
  return false;
}

/**
 * Pulls active courses and assignments from Canvas and upserts rows in `Task` for the user.
 */
export async function syncCanvasTasksForUser(
  userId: string,
  options: { forceMaterials?: boolean } = {}
): Promise<{
  upserted: number;
  courseCount: number;
  purged: number;
  /** null when the materials mirror threw; task sync still succeeded. */
  materials: MaterialsSyncStats | null;
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

  const now = new Date();
  const courses = await client.listActiveCourses();

  // NEU never concludes enrollments, so `enrollment_state=active` alone
  // returns every course ever taken. Keep term-named current courses; keep
  // undated instructor shells only if something is due recently/in future.
  const assignmentsByCourse = new Map<number, CanvasAssignment[]>();
  const liveCourses: CanvasCourse[] = [];
  for (const course of courses) {
    if (isTermNamedCourse(course, now)) {
      liveCourses.push(course);
      continue;
    }
    const assignments = await client.listAssignments(course.id);
    if (hasLiveAssignment(assignments, now)) {
      assignmentsByCourse.set(course.id, assignments);
      liveCourses.push(course);
    }
  }

  const activeCourseIds = liveCourses.map((c) => String(c.id));
  let upserted = 0;

  for (const course of liveCourses) {
    const groups = await client.listAssignmentGroups(course.id);
    const groupById = new Map<number, CanvasAssignmentGroup>();
    for (const g of groups) {
      groupById.set(g.id, g);
    }

    const assignments =
      assignmentsByCourse.get(course.id) ??
      (await client.listAssignments(course.id));
    assignmentsByCourse.set(course.id, assignments);

    for (const a of assignments) {
      const extId = String(a.id);

      const existing = await prisma.task.findFirst({
        where: {
          userId,
          taskProviderId: provider.id,
          externalTaskId: extId,
        },
      });

      if (shouldSkipAssignment(a, now, !existing)) {
        continue;
      }

      const gid = a.assignment_group_id ?? null;
      const group = gid != null ? groupById.get(gid) : undefined;
      const maxPts = maxPointsInGroup(assignments, gid);
      const weight = group?.group_weight ?? null;

      const rawGradeImpact = computeGradeImpactRaw({
        points: a.points_possible,
        maxInGroup: maxPts,
        groupWeightPercent: weight,
        omitFromFinalGrade: Boolean(a.omit_from_final_grade),
        gradingType: a.grading_type,
      });
      const gradeImpactScore = rawGradeImpact;
      const gradeWeightPercent = Math.min(100, Math.max(0, rawGradeImpact * 100));

      const { taskStatus, submissionStatus } = mapStatusFromSubmission(a);

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
        lastSyncedAt: now,
        syncStatus: "SYNCED",
        userId,
        taskProviderId: provider.id,
        gradeImpactScore,
        gradeWeightPercent,
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
        rubric: a.rubric?.length
          ? (JSON.parse(JSON.stringify(a.rubric)) as object)
          : Prisma.DbNull,
      };

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

  // Purge tasks from courses no longer in the active enrollment list
  const { count: purged } = await prisma.task.deleteMany({
    where: {
      userId,
      source: "CANVAS",
      courseId: { notIn: activeCourseIds },
    },
  });
  if (purged > 0) {
    logger.info(
      "Purged stale Canvas tasks from inactive courses",
      { userId, purged, activeCourseCount: activeCourseIds.length },
      LOG_SOURCE
    );
  }

  await prisma.taskProvider.update({
    where: { id: provider.id },
    data: {
      lastSyncedAt: now,
      error: null,
    },
  });

  await normalizeGradeImpactScoresForUser(userId);

  logger.info(
    "Canvas sync completed",
    {
      userId,
      upserted,
      purged,
      courseCount: liveCourses.length,
      enrolledCourseCount: courses.length,
    },
    LOG_SOURCE
  );

  // Materials ride along, but never at the task sync's expense: tasks are
  // already committed, so a materials failure is logged, not thrown.
  let materials: MaterialsSyncStats | null = null;
  try {
    materials = await syncCanvasMaterials(
      client,
      userId,
      provider.id,
      liveCourses,
      assignmentsByCourse,
      now,
      { force: options.forceMaterials }
    );
  } catch (error) {
    logger.error(
      "Canvas materials sync failed",
      { userId, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }

  return { upserted, courseCount: liveCourses.length, purged, materials };
}

/**
 * Spec §5.2.3: normalize Canvas grade impact to 0–1 across the user's active Canvas pool.
 */
async function normalizeGradeImpactScoresForUser(userId: string): Promise<void> {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      status: { not: "completed" },
      source: "CANVAS",
      gradeImpactScore: { not: null },
    },
    select: { id: true, gradeImpactScore: true },
  });
  if (tasks.length === 0) {
    return;
  }
  const max = Math.max(
    ...tasks.map((t) => t.gradeImpactScore ?? 0),
    1e-9
  );
  if (max <= 1e-9) {
    return;
  }
  await prisma.$transaction(
    tasks.map((t) =>
      prisma.task.update({
        where: { id: t.id },
        data: {
          gradeImpactScore: (t.gradeImpactScore ?? 0) / max,
        },
      })
    )
  );
}
