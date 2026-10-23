/**
 * Shared ranking pipeline for Focus queue and briefing (docs/focus-mode.md).
 */
import type { Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import {
  computeErwinAvailabilitySummary,
  filterTasksByAvailabilityCapacity,
} from "@/lib/erwin/availability";
import { computeFocusBriefing } from "@/lib/erwin/briefing";
import { openWorkWhere } from "@/lib/erwin/open-work";
import {
  type TaskForRanking,
  filterTasksForRanking,
  orderTasksStage1,
  stage1MetaForTasks,
} from "@/lib/erwin/rank-stage1";
import { prisma } from "@/lib/prisma";

export function toTaskForRanking(r: {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  unlockAt: Date | null;
  lockAt: Date | null;
  duration: number | null;
  gradeImpactScore: number | null;
  submissionStatus: string | null;
  source: string | null;
  category: string | null;
  priority: string | null;
  pointsPossible: number | null;
  courseId: string | null;
  skipCount: number;
  lastSkippedAt: Date | null;
  createdAt: Date;
  postponedUntil?: Date | null;
  parentTaskId?: string | null;
  goalLinks?: Array<{ goal: { importanceScore: number | null } }> | null;
}): TaskForRanking {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    dueDate: r.dueDate,
    unlockAt: r.unlockAt,
    lockAt: r.lockAt,
    duration: r.duration,
    gradeImpactScore: r.gradeImpactScore,
    submissionStatus: r.submissionStatus,
    source: r.source,
    category: r.category,
    priority: r.priority,
    pointsPossible: r.pointsPossible,
    courseId: r.courseId,
    skipCount: r.skipCount,
    lastSkippedAt: r.lastSkippedAt,
    createdAt: r.createdAt,
    postponedUntil: r.postponedUntil ?? null,
    parentTaskId: r.parentTaskId ?? null,
    // Erwin v3: a task can serve several goals — it surfaces on its most
    // important one (see rank-stage1 computeStage1Scores).
    goalImportanceScore:
      r.goalLinks?.reduce<number | null>((best, link) => {
        const score = link.goal.importanceScore;
        if (score == null) return best;
        return best == null ? score : Math.max(best, score);
      }, null) ?? null,
  };
}

export type FocusQueueTaskRow = Prisma.TaskGetPayload<{
  include: {
    tags: true;
    project: true;
    goalLinks: { include: { goal: true } };
    subtasks: {
      select: { id: true; title: true; status: true; order: true };
    };
  };
}>;

export interface FocusQueueCoreResult {
  rows: FocusQueueTaskRow[];
  minimal: TaskForRanking[];
  filtered: TaskForRanking[];
  slotAware: TaskForRanking[];
  ordered: TaskForRanking[];
  meta: ReturnType<typeof stage1MetaForTasks>;
  availability: Awaited<ReturnType<typeof computeErwinAvailabilitySummary>>;
  slotMinutesForRank: number | null;
}

/**
 * Loads tasks, applies Stage 1 ranking with availability filtering.
 */
export async function buildFocusQueueCore(
  userId: string
): Promise<FocusQueueCoreResult> {
  const now = newDate();

  const rows = await prisma.task.findMany({
    where: openWorkWhere(userId, now),
    include: {
      tags: true,
      project: true,
      goalLinks: { include: { goal: true } },
      subtasks: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, status: true, order: true },
      },
    },
  });

  const minimal = rows.map((r) => toTaskForRanking(r));
  const filtered = filterTasksForRanking(minimal, now);

  const availability = await computeErwinAvailabilitySummary(userId, now);
  const slotAware = filterTasksByAvailabilityCapacity(
    filtered,
    availability.effectiveCapacityMinutes,
    availability.applyTaskDurationFilter
  );

  const slotMinutesForRank = availability.applyTaskDurationFilter
    ? availability.effectiveCapacityMinutes
    : null;

  const ordered = orderTasksStage1(slotAware, now, {
    slotMinutes: slotMinutesForRank,
  });

  const meta = stage1MetaForTasks(ordered, slotAware, now, slotMinutesForRank);

  return {
    rows,
    minimal,
    filtered,
    slotAware,
    ordered,
    meta,
    availability,
    slotMinutesForRank,
  };
}

export function computeBriefingStripFromCore(
  filtered: TaskForRanking[],
  slotAware: TaskForRanking[],
  availability: FocusQueueCoreResult["availability"],
  now: Date = newDate()
) {
  const briefingBase = computeFocusBriefing(filtered, now);
  return {
    ...briefingBase,
    pendingCount: slotAware.length,
    effectiveCapacityMinutes: availability.applyTaskDurationFilter
      ? availability.effectiveCapacityMinutes
      : null,
    slotNarrative: availability.slotNarrative ?? null,
  };
}
