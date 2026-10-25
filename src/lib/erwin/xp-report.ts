/**
 * XP over a span of days, for the tools that report on it from outside Erwin:
 * ops' weekly report and its HUD. Built from the same events as the Ladder, so
 * a number there and a number here never disagree, and from rows the route
 * loads, so it can be checked without a database.
 */

import { STAT_KEYS, type StatKey } from "./stats";
import {
  creditedGoals,
  economyOf,
  levelFor,
  levelProgress,
  roundXp,
  standsAlone,
  statsOf,
  sumStats,
  xpEvents,
  type LevelProgress,
  type XpGoalRow,
  type XpTaskRow,
} from "./xp";

export interface XpReportGoalRow extends XpGoalRow {
  title: string;
  externalId: string | null;
  cycleId: string;
}

export interface XpReportTaskRow extends XpTaskRow {
  /** Where the task came from (CANVAS, venture:<slug>); null when made by hand. */
  source: string | null;
}

export interface XpReportInput {
  /** The span's first and last days, inclusive, YYYY-MM-DD in the user's zone. */
  from: string;
  to: string;
  /** The running hex, whose goals are the ones feeding a stat now. */
  currentCycleId: string;
  goals: XpReportGoalRow[];
  /** Finished top-level tasks. */
  done: XpReportTaskRow[];
}

export interface XpGoalRef {
  externalId: string | null;
  title: string;
}

/** A stat as the span left it: all its XP through the last day and where
 *  that puts it on the level curve, with what the span added. */
export interface XpReportStat extends LevelProgress {
  xp: number;
  gained: number;
  /** Its level the day before the span began, so a report can name a level-up. */
  levelBefore: number;
}

export interface XpReport {
  from: string;
  to: string;
  stats: Record<StatKey, XpReportStat>;
  /** Tasks finished in the span. */
  tasks: number;
  /** Each goal the span's work credited: its tasks, and the XP it passed to its stats. */
  goals: (XpGoalRef & { tasks: number; xp: number })[];
  /** Tasks finished in the span that serve no goal, by where they came from. */
  unlinked: { source: string | null; count: number }[];
  /** Bosses felled in the span, and the goal each one sits under. */
  bosses: (XpGoalRef & { day: string; goal: XpGoalRef | null })[];
  /** The nearest boss still standing from the span's last day on. */
  nextBoss: (XpGoalRef & { day: string; goal: XpGoalRef | null }) | null;
  /** The running hex's active goals behind each stat. A stat with none can't gain XP. */
  feeders: Record<StatKey, XpGoalRef[]>;
}

export function buildXpReport(input: XpReportInput): XpReport {
  const { from, to } = input;
  const byId = new Map(input.goals.map((goal) => [goal.id, goal]));
  const economy = economyOf(input.goals);
  const refOf = (id: string): XpGoalRef => {
    const goal = byId.get(id)!;
    return { externalId: goal.externalId, title: goal.title };
  };
  const goalAbove = (bossId: string) => {
    const above = creditedGoals([bossId], economy).filter((id) => id !== bossId);
    return above.length ? refOf(above[0]) : null;
  };
  const standing = input.goals
    .filter((goal) => goal.isBoss && goal.status === "active" && goal.day !== null && goal.day >= to)
    .sort((a, b) => a.day!.localeCompare(b.day!) || a.title.localeCompare(b.title));

  const events = xpEvents(input.goals, input.done, economy);
  const span = events.filter((event) => event.day >= from && event.day <= to);
  const lifetime = sumStats(events.filter((event) => event.day <= to));
  const gained = sumStats(span);
  const before = sumStats(events.filter((event) => event.day < from));

  const credit = new Map<string, { tasks: number; xp: number }>();
  for (const event of span) {
    for (const { goalId, xp } of event.credit) {
      const entry = credit.get(goalId) ?? { tasks: 0, xp: 0 };
      if (event.kind === "task") entry.tasks += 1;
      // XP on a goal that develops no stat reached nothing, so it isn't the goal's.
      if (statsOf(goalId, economy).length) entry.xp += xp;
      credit.set(goalId, entry);
    }
  }

  const sourceOf = new Map(input.done.map((task) => [task.id, task.source]));
  const unlinked = new Map<string | null, number>();
  for (const event of span) {
    if (event.kind !== "task" || event.credit.length > 0) continue;
    const source = sourceOf.get(event.id) ?? null;
    unlinked.set(source, (unlinked.get(source) ?? 0) + 1);
  }

  // Only a goal in play feeds a stat now; one done or set aside earns nothing new.
  const running = input.goals.filter(
    (goal) => goal.cycleId === input.currentCycleId && goal.status === "active" && standsAlone(goal, byId)
  );

  return {
    from,
    to,
    stats: Object.fromEntries(
      STAT_KEYS.map((key) => [
        key,
        {
          xp: lifetime[key],
          ...levelProgress(lifetime[key]),
          gained: gained[key],
          levelBefore: levelFor(before[key]),
        },
      ])
    ) as Record<StatKey, XpReportStat>,
    tasks: span.filter((event) => event.kind === "task").length,
    goals: [...credit]
      .map(([id, { tasks, xp }]) => ({ ...refOf(id), tasks, xp: roundXp(xp) }))
      .sort((a, b) => b.xp - a.xp || b.tasks - a.tasks || a.title.localeCompare(b.title)),
    unlinked: [...unlinked]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || (a.source ?? "").localeCompare(b.source ?? "")),
    bosses: span
      .filter((event) => event.kind === "boss")
      .map((event) => ({ ...refOf(event.id), day: event.day, goal: goalAbove(event.id) }))
      .sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title)),
    nextBoss: standing.length
      ? { ...refOf(standing[0].id), day: standing[0].day!, goal: goalAbove(standing[0].id) }
      : null,
    feeders: Object.fromEntries(
      STAT_KEYS.map((key) => [
        key,
        running.filter((goal) => statsOf(goal.id, economy).includes(key)).map((goal) => refOf(goal.id)),
      ])
    ) as Record<StatKey, XpGoalRef[]>,
  };
}
