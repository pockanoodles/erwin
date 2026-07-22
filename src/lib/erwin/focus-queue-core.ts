/**
 * Shared ranking pipeline for Focus queue and briefing (docs/focus-mode.md).
 */

import type { Prisma } from "@prisma/client";

import {
  computeErwinAvailabilitySummary,
  filterTasksByAvailabilityCapacity,
} from "@/lib/erwin/availability";
import { computeFocusBriefing } from "@/lib/erwin/briefing";
import {
  filterTasksForRanking,
  orderTasksStage1,
  stage1MetaForTasks,
  type TaskForRanking,
} from "@/lib/erwin/rank-stage1";
import { newDate } from "@/lib/date-utils";
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
  createdAt: Date;
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
    createdAt: r.createdAt,
  };
}

export type FocusQueueTaskRow = Prisma.TaskGetPayload<{
  include: { tags: true; project: true };
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
export async function buildFocusQueueCore(userId: string): Promise<FocusQueueCoreResult> {
  const now = newDate();

  const rows = await prisma.task.findMany({
    where: {
      userId,
      status: { not: "completed" },
    },
    include: {
      tags: true,
      project: true,
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

  const meta = stage1MetaForTasks(
    ordered,
    slotAware,
    now,
    slotMinutesForRank
  );

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
