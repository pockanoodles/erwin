/**
 * Canvas → Sigwald tasks for one course, projected from the gradebook the same
 * sync just wrote (`sync-canvas-gradebook.ts`). Read-only relative to Canvas.
 *
 * One task per actionable assignment (`isActionable`), whatever its
 * submission state: work handed in before Sigwald first saw it is a completed
 * task, not a gap in the record. The task holds what any task has (title,
 * dates, status, impact); Canvas's own facts stay on the gradebook row, which
 * links to its task. Tasks that are no longer actionable are deleted —
 * unless someone added subtasks to them. (A task whose assignment Canvas
 * dropped loses its row; `sync-canvas.ts` sweeps those up.)
 */

import { CLOSED_STATES, DONE_STATES, isActionable } from "@/lib/canvas/gradebook-plan";
import { gradeShares } from "@/lib/canvas/grade-share";
import type { GradebookSyncResult } from "@/lib/canvas/sync-canvas-gradebook";
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

export interface TaskProjectionStats {
  upserted: number;
  removed: number;
}

export async function projectCourseTasks(
  userId: string,
  providerId: string,
  course: { rowId: string; weighted: boolean },
  gradebook: GradebookSyncResult,
  now: Date
): Promise<TaskProjectionStats> {
  const { assignments } = gradebook;
  const courseRowId = course.rowId;
  // Impact is an assignment's share of the final grade (lib/canvas/grade-share.ts).
  const shares = gradeShares(
    assignments.map((a) => ({
      id: String(a.id),
      groupId: a.assignment_group_id != null ? String(a.assignment_group_id) : null,
      pointsPossible: a.points_possible ?? null,
      omitFromFinalGrade: Boolean(a.omit_from_final_grade),
      gradingType: a.grading_type ?? null,
    })),
    gradebook.groups.map((g) => ({ id: String(g.id), weight: g.group_weight ?? null })),
    course.weighted
  );

  const existing = await prisma.task.findMany({
    where: {
      userId,
      source: "CANVAS",
      // Linked to this course's gradebook, or carrying one of its
      // assignments' ids (a task whose link was lost picks it back up).
      OR: [
        { courseAssignment: { courseId: courseRowId } },
        { externalTaskId: { in: [...gradebook.planned.keys()] } },
      ],
    },
    select: {
      id: true,
      externalTaskId: true,
      status: true,
      completedAt: true,
      closedAt: true,
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

    const impact = shares.get(extId) ?? 0;

    // A hand-marked completion stands: group and external submissions never
    // show up in Canvas, so "unsubmitted" can't reopen the task. One a
    // correction made, and that correction is gone, does reopen.
    const undone = gradebook.undone.has(extId);
    const done = (prev?.status === "completed" && !undone) || DONE_STATES.has(plan.state);
    // Closed without a submission: it locked (missed) or the course ended.
    // Dated by the lock when there is one, kept from the sync that first saw it.
    const closed = !done && CLOSED_STATES.has(plan.state);
    const payload = {
      title: plan.name,
      description: a.description ?? null,
      status: done ? "completed" : "todo",
      // Completed by this sync: when it was handed in, not when Sigwald noticed.
      completedAt: done
        ? (prev?.completedAt ?? plan.submittedAt ?? plan.gradedAt ?? now)
        : undone
          ? null
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
      impact,
      closedAt: closed
        ? (prev?.closedAt ?? (plan.lockAt && plan.lockAt <= now ? plan.lockAt : now))
        : null,
      category: "SCHOOL",
      externalUrl: plan.htmlUrl,
      urgencyTier: "NONE",
    };

    const task = prev
      ? await prisma.task.update({ where: { id: prev.id }, data: payload, select: { id: true } })
      : await prisma.task.create({ data: payload, select: { id: true } });
    kept.add(extId);
    upserted += 1;

    const rowId = gradebook.rowIds.get(extId);
    if (rowId) {
      await prisma.courseAssignment.update({
        where: { id: rowId },
        data: { taskId: task.id, gradeWeightPercent: impact * 100 },
      });
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
 * Spec §5.2.3: scale coursework's impact to 0–1 across the user's open Canvas pool.
 */
export async function normalizeCourseworkImpact(userId: string): Promise<void> {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      status: { not: "completed" },
      source: "CANVAS",
      impact: { not: null },
    },
    select: { id: true, impact: true },
  });
  if (tasks.length === 0) {
    return;
  }
  const max = Math.max(
    ...tasks.map((t) => t.impact ?? 0),
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
          impact: (t.impact ?? 0) / max,
        },
      })
    )
  );
}
