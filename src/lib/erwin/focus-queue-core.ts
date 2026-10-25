/**
 * Shared ranking pipeline for Focus queue and briefing (docs/focus-mode.md).
 * Modules weigh in through the registry: a lift before ranking (Ladder's
 * goals), facts after it (Courses' course and grade). Neither is read here.
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
  type RankSignals,
  type TaskForRanking,
  filterTasksForRanking,
  isDangerResolved,
  orderTasksStage1,
  stage1MetaForTasks,
} from "@/lib/erwin/rank-stage1";
import { prisma } from "@/lib/prisma";

import { moduleRankSignals, moduleTaskFacts } from "@/modules/hooks";
import type { TaskFacts } from "@/modules/server";
import { moduleView } from "@/modules/state";

export function toTaskForRanking(
  r: {
    id: string;
    title: string;
    status: string;
    dueDate: Date | null;
    unlockAt: Date | null;
    lockAt: Date | null;
    duration: number | null;
    impact: number | null;
    closedAt: Date | null;
    priority: string | null;
    skipCount: number;
    lastSkippedAt: Date | null;
    createdAt: Date;
    postponedUntil?: Date | null;
    parentTaskId?: string | null;
  },
  signals: RankSignals = {}
): TaskForRanking {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    dueDate: r.dueDate,
    unlockAt: r.unlockAt,
    lockAt: r.lockAt,
    duration: r.duration,
    impact: r.impact,
    closedAt: r.closedAt,
    priority: r.priority,
    skipCount: r.skipCount,
    lastSkippedAt: r.lastSkippedAt,
    createdAt: r.createdAt,
    postponedUntil: r.postponedUntil ?? null,
    parentTaskId: r.parentTaskId ?? null,
    lift: signals.lift ?? null,
    stakes: signals.stakes ?? null,
    stakesGroup: signals.stakesGroup ?? null,
  };
}

export type FocusQueueTaskRow = Prisma.TaskGetPayload<{
  include: {
    tags: true;
    project: true;
    subtasks: {
      select: { id: true; title: true; status: true; order: true };
    };
  };
}>;

export interface FocusQueueCoreResult {
  rows: FocusQueueTaskRow[];
  /** What the modules add to each row, keyed by task id: spread it onto the row. */
  facts: Map<string, TaskFacts>;
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
  const modules = await moduleView(userId);

  const rows = await prisma.task.findMany({
    where: openWorkWhere(userId, now, modules.hidden),
    include: {
      tags: true,
      project: true,
      subtasks: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, status: true, order: true },
      },
    },
  });

  const ids = rows.map((r) => r.id);
  const signals = await moduleRankSignals(prisma, userId, ids, modules.isOn);
  const minimal = rows.map((r) => toTaskForRanking(r, signals.get(r.id)));
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

  const danger = new Set(
    filtered.filter((t) => isDangerResolved(t, now)).map((t) => t.id)
  );
  const facts = await moduleTaskFacts(
    prisma,
    userId,
    ids.map((id) => ({ id, danger: danger.has(id) })),
    modules.isOn
  );

  return {
    rows,
    facts,
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
