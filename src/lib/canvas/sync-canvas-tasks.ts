/**
 * Canvas → Erwin tasks for one course, projected from the gradebook the same
 * sync just wrote (`sync-canvas-gradebook.ts`). Read-only relative to Canvas.
 *
 * One task per actionable assignment (`isActionable`), whatever its
 * submission state: work handed in before Erwin first saw it is a completed
 * task, not a gap in the record. Tasks whose assignment Canvas no longer has,
 * or that are no longer actionable, are deleted — unless someone added
 * subtasks to them.
 */

import { Prisma } from "@prisma/client";

import { DONE_STATES, isActionable } from "@/lib/canvas/gradebook-plan";
import type { GradebookSyncResult } from "@/lib/canvas/sync-canvas-gradebook";
import type { CanvasAssignment, CanvasCourse } from "@/lib/canvas/types";
import { prisma } from "@/lib/prisma";

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

export interface TaskProjectionStats {
  upserted: number;
  removed: number;
}

export async function projectCourseTasks(
  userId: string,
  providerId: string,
  course: CanvasCourse,
  gradebook: GradebookSyncResult,
  now: Date
): Promise<TaskProjectionStats> {
  const { assignments } = gradebook;
  const groupById = new Map(gradebook.groups.map((g) => [g.id, g]));

  const existing = await prisma.task.findMany({
    where: { userId, taskProviderId: providerId, source: "CANVAS", courseId: String(course.id) },
    select: {
      id: true,
      externalTaskId: true,
      status: true,
      completedAt: true,
      _count: { select: { subtasks: true } },
    },
  });
  const byExternal = new Map(existing.map((t) => [t.externalTaskId, t]));
  const kept = new Set<string>();
  let upserted = 0;

  for (const a of assignments) {
    const plan = gradebook.planned.get(String(a.id));
    if (!plan || !isActionable(a)) {
      continue;
    }
    const extId = plan.canvasId;
    const prev = byExternal.get(extId);

    const gid = a.assignment_group_id ?? null;
    const group = gid != null ? groupById.get(gid) : undefined;
    const weight = group?.group_weight ?? null;
    const gradeImpactScore = computeGradeImpactRaw({
      points: a.points_possible,
      maxInGroup: maxPointsInGroup(assignments, gid),
      groupWeightPercent: weight,
      omitFromFinalGrade: plan.omitFromFinalGrade,
      gradingType: plan.gradingType,
    });

    // todo: apply assignment group drop_lowest rules when adjusting gradeImpactScore (spec §5.2.7 / §8.1)

    // A hand-marked completion stands: group and external submissions never
    // show up in Canvas, so "unsubmitted" can't reopen the task.
    const done = prev?.status === "completed" || DONE_STATES.has(plan.state);
    const payload = {
      title: plan.name,
      description: a.description ?? null,
      status: done ? "completed" : "todo",
      // Completed by this sync: when it was handed in, not when Erwin noticed.
      completedAt: done
        ? (prev?.completedAt ?? plan.submittedAt ?? plan.gradedAt ?? now)
        : undefined,
      dueDate: plan.dueAt,
      lockAt: plan.lockAt,
      unlockAt: plan.unlockAt,
      duration: estimateDurationMinutes(plan.submissionTypes),
      source: "CANVAS",
      externalTaskId: extId,
      lastSyncedAt: now,
      syncStatus: "SYNCED",
      userId,
      taskProviderId: providerId,
      gradeImpactScore,
      gradeWeightPercent: Math.min(100, Math.max(0, gradeImpactScore * 100)),
      courseId: String(course.id),
      courseName: course.name,
      assignmentGroupName: group?.name ?? null,
      pointsPossible: plan.pointsPossible,
      groupWeight: weight,
      submissionTypes: plan.submissionTypes,
      gradingType: plan.gradingType,
      submissionStatus: plan.state,
      omitFromFinalGrade: plan.omitFromFinalGrade,
      category: "SCHOOL",
      externalUrl: plan.htmlUrl,
      urgencyTier: "NONE",
      rubric: a.rubric?.length
        ? (JSON.parse(JSON.stringify(a.rubric)) as Prisma.InputJsonValue)
        : Prisma.DbNull,
    };

    const task = prev
      ? await prisma.task.update({ where: { id: prev.id }, data: payload, select: { id: true } })
      : await prisma.task.create({ data: payload, select: { id: true } });
    kept.add(extId);
    upserted += 1;

    const rowId = gradebook.rowIds.get(extId);
    if (rowId) {
      await prisma.courseAssignment.update({ where: { id: rowId }, data: { taskId: task.id } });
    }
  }

  // Gone from Canvas, or never work to begin with. Subtasks are someone's own
  // notes, so a task carrying them stays.
  const stale = existing.filter(
    (t) => t.externalTaskId && !kept.has(t.externalTaskId) && t._count.subtasks === 0
  );
  if (stale.length > 0) {
    await prisma.task.deleteMany({ where: { id: { in: stale.map((t) => t.id) } } });
  }

  return { upserted, removed: stale.length };
}

/**
 * Spec §5.2.3: normalize Canvas grade impact to 0–1 across the user's active Canvas pool.
 */
export async function normalizeGradeImpactScoresForUser(userId: string): Promise<void> {
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
