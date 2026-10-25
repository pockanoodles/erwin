/**
 * The Ladder: one hex read as a character sheet. Builds the GET
 * /api/erwin/ladder payload from rows the route loads, so every number on the
 * page can be checked without a database.
 *
 * Everything is keyed by calendar day in the user's zone, so work finished on
 * a hex's last evening counts in that hex and not in the next one its UTC time
 * falls in.
 */

import type {
  HexRef,
  HexState,
  LadderBoss,
  LadderEvent,
  LadderGoal,
  LadderPayload,
  LadderStat,
} from "@/types/ladder";

import { hexDayRange, hexLabel, hexMonths, hexOfDay } from "./hex";
import { STAT_KEYS, isStatKey, type StatKey } from "./stats";
import {
  creditedGoals,
  economyOf,
  levelProgress,
  standsAlone,
  statsOf,
  sumStats,
  xpEvents,
  type XpEvent,
  type XpGoalRow,
  type XpTaskRow,
} from "./xp";

export interface LadderGoalRow extends XpGoalRow {
  title: string;
  targetDate: string | null;
  externalId: string | null;
  importanceScore: number | null;
  cycleId: string;
  whyItMatters: string | null;
  definitionOfDone: string | null;
  /** Bound to a Canvas assignment. */
  bound: boolean;
}

export interface LadderTaskRow extends XpTaskRow {
  title: string;
  courseName: string | null;
}

export interface LadderCycleRow {
  id: string;
  theme: string;
  focusStats: string[];
  /** The vault's map sets this Build, so it can't change in Erwin. */
  buildProjected: boolean;
  /** Its first day, YYYY-MM-DD, which names the hex it covers. */
  first: string;
}

export interface LadderInput {
  today: string;
  hex: HexRef;
  /** The running hex's cycle, whose goals a hex that hasn't begun shows. */
  currentCycleId: string;
  goals: LadderGoalRow[];
  /** Finished top-level tasks. */
  done: LadderTaskRow[];
  /** Tasks open and actionable now, and their goal links. */
  open: { id: string; goalIds: string[] }[];
  cycles: LadderCycleRow[];
}

const DAY_MS = 86_400_000;

const dayTime = (day: string) =>
  Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

const addDays = (day: string, n: number) =>
  new Date(dayTime(day) + n * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (from: string, to: string) => Math.round((dayTime(to) - dayTime(from)) / DAY_MS);

const hexOrder = (hex: HexRef) => hex.year * 6 + hex.index;

function stateOf(hex: HexRef, current: HexRef): HexState {
  const delta = hexOrder(hex) - hexOrder(current);
  return delta < 0 ? "past" : delta > 0 ? "future" : "current";
}

const total = (xp: Record<StatKey, number>) => STAT_KEYS.reduce((sum, key) => sum + xp[key], 0);

/** Nearest first; ties by title so the order never flickers. */
const byDay = <T extends { day: string; title: string }>(a: T, b: T) =>
  a.day.localeCompare(b.day) || a.title.localeCompare(b.title);

export function buildLadder(input: LadderInput): LadderPayload {
  const { today, hex: ref } = input;
  const current = hexOfDay(today);
  const { first, last } = hexDayRange(ref);
  const state = stateOf(ref, current);
  const days = daysBetween(first, last) + 1;
  const cycleOf = (day: string) => input.cycles.find((cycle) => cycle.first === day) ?? null;
  const cycle = cycleOf(first);
  // A hex that hasn't begun has no row yet. It will start with the Build of
  // the latest hex before it (ensureCurrentHex), so that's what it previews.
  const before =
    state === "future" && !cycle
      ? ([...input.cycles].filter((c) => c.first < first).sort((a, b) => b.first.localeCompare(a.first))[0] ?? null)
      : null;
  const build = (cycle?.focusStats ?? before?.focusStats ?? []).filter(isStatKey);

  const byId = new Map(input.goals.map((goal) => [goal.id, goal]));
  const economy = economyOf(input.goals);
  const titleOf = new Map<string, string>([
    ...input.done.map((task) => [task.id, task.title] as const),
    ...input.goals.map((goal) => [goal.id, goal.title] as const),
  ]);

  const events = xpEvents(input.goals, input.done, economy);
  const within = (from: string, to: string) => (event: XpEvent) => event.day >= from && event.day <= to;
  const hexEvents = events.filter(within(first, last));
  // A finished hex shows the sheet as it stood on its last day.
  const asOf = state === "past" ? last : today;
  const lifetime = sumStats(events.filter((event) => event.day <= asOf));
  const gained = sumStats(hexEvents);

  // The goals on show: the hex's own (the running hex's, for one that hasn't
  // begun), plus any goal its work credited. Bosses are milestones on a
  // goal's path, so only a boss with nothing above it gets a row.
  const shownCycleId = state === "future" ? input.currentCycleId : (cycle?.id ?? null);
  const rowIds = new Set<string>();
  for (const goal of input.goals) {
    if (goal.cycleId === shownCycleId && standsAlone(goal, byId)) rowIds.add(goal.id);
  }
  for (const event of hexEvents) for (const { goalId } of event.credit) rowIds.add(goalId);
  const rowStats = new Map([...rowIds].map((id) => [id, statsOf(id, economy)]));

  const xpByGoal = new Map<string, number>();
  const doneByGoal = new Map<string, number>();
  const add = (map: Map<string, number>, id: string, n: number) => map.set(id, (map.get(id) ?? 0) + n);
  for (const event of hexEvents) {
    for (const { goalId, xp } of event.credit) {
      // XP on a goal that develops no stat reached nothing, so it isn't the goal's.
      if (rowStats.get(goalId)?.length) add(xpByGoal, goalId, xp);
      if (event.kind === "task") add(doneByGoal, goalId, 1);
    }
  }
  const openByGoal = new Map<string, number>();
  for (const task of input.open) {
    for (const goalId of creditedGoals(task.goalIds, economy)) add(openByGoal, goalId, 1);
  }

  const toBoss = (goal: LadderGoalRow): LadderBoss => {
    const above = creditedGoals([goal.id], economy).filter((id) => id !== goal.id);
    return {
      id: goal.id,
      title: goal.title,
      day: goal.day!,
      felled: goal.status === "done",
      goalTitle: above.length ? byId.get(above[0])!.title : null,
      bound: goal.bound,
      managed: goal.externalId !== null,
    };
  };
  const datedBosses = input.goals.filter((goal) => goal.isBoss && goal.day).map(toBoss).sort(byDay);
  const ahead = datedBosses.filter((boss) => !boss.felled && boss.day >= today);
  const nextBossOf = new Map<string, { title: string; day: string }>();
  for (const boss of ahead) {
    for (const goalId of creditedGoals([boss.id], economy)) {
      if (!nextBossOf.has(goalId)) nextBossOf.set(goalId, { title: boss.title, day: boss.day });
    }
  }

  const goals: LadderGoal[] = [...rowIds]
    .map((id) => byId.get(id)!)
    .map((goal) => ({
      id: goal.id,
      title: goal.title,
      stats: rowStats.get(goal.id) ?? [],
      develops: goal.develops.filter(isStatKey),
      importance: goal.importanceScore,
      managed: goal.externalId !== null,
      isBoss: goal.isBoss,
      whyItMatters: goal.whyItMatters,
      definitionOfDone: goal.definitionOfDone,
      targetDate: goal.targetDate,
      parents: goal.parentIds.flatMap((parentId) => {
        const parent = byId.get(parentId);
        return parent ? [{ id: parent.id, title: parent.title }] : [];
      }),
      xp: xpByGoal.get(goal.id) ?? 0,
      done: doneByGoal.get(goal.id) ?? 0,
      open: openByGoal.get(goal.id) ?? 0,
      nextBoss: nextBossOf.get(goal.id) ?? null,
    }))
    .sort(
      (a, b) =>
        b.xp - a.xp ||
        b.done - a.done ||
        b.open - a.open ||
        (b.importance ?? 0) - (a.importance ?? 0) ||
        a.title.localeCompare(b.title)
    );

  const stats: LadderStat[] = STAT_KEYS.map((key) => {
    const feeders = goals.filter((goal) => goal.stats.includes(key)).map((goal) => goal.id);
    const inBuild = build.includes(key);
    return {
      key,
      xp: lifetime[key],
      ...levelProgress(lifetime[key]),
      gained: gained[key],
      build: inBuild,
      feeders,
      flag: !inBuild
        ? null
        : feeders.length === 0
          ? "starved"
          : state !== "future" && gained[key] === 0
            ? "idle"
            : null,
    };
  });

  const gainedTotal = total(gained);
  const tasksInHex = hexEvents.filter((event) => event.kind === "task");

  const doneOnDay = new Map<string, number>();
  const xpOnDay = new Map<string, number>();
  for (const event of hexEvents) {
    if (event.kind === "task") add(doneOnDay, event.day, 1);
    add(xpOnDay, event.day, total(sumStats([event])));
  }

  const courseOf = new Map(input.done.map((task) => [task.id, task.courseName]));
  const log: LadderEvent[] = hexEvents
    .map((event) => ({
      kind: event.kind,
      id: event.id,
      title: titleOf.get(event.id) ?? "",
      day: event.day,
      courseName: event.kind === "task" ? (courseOf.get(event.id) ?? null) : null,
      goalIds: event.credit.map((c) => c.goalId),
      stats: event.stats,
      lost: event.lost,
    }))
    .sort((a, b) => b.day.localeCompare(a.day) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));

  return {
    today,
    current,
    hex: {
      ...ref,
      label: hexLabel(ref),
      months: hexMonths(ref.index),
      first,
      last,
      state,
      days,
      elapsed: state === "past" ? days : state === "future" ? 0 : daysBetween(first, today) + 1,
      cycleId: cycle?.id ?? null,
      theme: cycle?.theme ?? "",
      build,
      buildProjected: (cycle ?? before)?.buildProjected ?? false,
      inheritedFrom: !cycle && before && build.length ? hexMonths(hexOfDay(before.first).index) : null,
    },
    stats,
    summary: {
      level: stats.reduce((sum, stat) => sum + stat.level, 0),
      xp: total(lifetime),
      gained: gainedTotal,
      done: tasksInHex.length,
      unlinked: tasksInHex.filter((event) => event.credit.length === 0).length,
      buildShare:
        build.length && gainedTotal > 0
          ? build.reduce((sum, key) => sum + gained[key], 0) / gainedTotal
          : null,
    },
    days: Array.from({ length: days }, (_, i) => {
      const day = addDays(first, i);
      return { day, done: doneOnDay.get(day) ?? 0, xp: xpOnDay.get(day) ?? 0 };
    }),
    goals,
    bosses: datedBosses.filter((boss) => boss.day >= first && boss.day <= last),
    nextBoss: ahead[0] ?? null,
    events: log,
    year: [1, 2, 3, 4, 5, 6].map((index) => {
      const range = hexDayRange({ year: ref.year, index });
      const inside = events.filter(within(range.first, range.last));
      return {
        index,
        months: hexMonths(index),
        state: stateOf({ year: ref.year, index }, current),
        xp: total(sumStats(inside)),
        done: inside.filter((event) => event.kind === "task").length,
        build: (cycleOf(range.first)?.focusStats ?? []).filter(isStatKey),
      };
    }),
    managedExternally: input.goals.some((goal) => goal.externalId !== null),
  };
}
