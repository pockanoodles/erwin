/**
 * The XP economy: Erwin's finished work read as stat XP. Derived on read and
 * never stored, so changing a goal's stats recomputes history instead of
 * leaving a stale number behind.
 *
 * The rules are brain/_map.md's ("Economy"), the ones ops' reflect pump
 * applies for the weekly report (ops/pumps/reflect.py and levels.py), shared
 * by convention like the stat keys:
 *
 *  - A finished task is 1 XP, split evenly across the goals it serves and then
 *    across each goal's stats, so total XP always equals credited work and a
 *    three-stat goal mints no more than a two-stat one.
 *  - A felled boss is 5 XP, split the same way and dated on the boss's day.
 *  - Level L costs L(L+1)/2 lifetime XP (L5 = 15, L10 = 55), and 0 to 2 XP is
 *    level 1.
 *
 * Erwin credits through its task↔goal links, which lib/erwin/goal-rules.ts
 * files by the same source rules the weekly report credits by. The two part
 * where the vault's ledger logged a week before a late sync backfilled it:
 * that work counts here and stays missing there.
 */

import { STAT_KEYS, isStatKey, type StatKey } from "./stats";

export const TASK_XP = 1;
export const BOSS_XP = 5;

export type StatXp = Record<StatKey, number>;

export function emptyStatXp(): StatXp {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 0])) as StatXp;
}

/** The largest level L ≥ 1 whose cost L(L+1)/2 is covered (0 to 2 XP is level 1). */
export function levelFor(xp: number): number {
  if (xp < 3) return 1;
  let level = Math.floor((Math.sqrt(8 * xp + 1) - 1) / 2);
  // Float edges: an exact threshold (15 → 5) must never land one level off.
  while (((level + 1) * (level + 2)) / 2 <= xp) level += 1;
  while (level > 1 && (level * (level + 1)) / 2 > xp) level -= 1;
  return level;
}

/** The XP a level starts at: 0 for level 1, L(L+1)/2 after. */
export function levelStart(level: number): number {
  return level <= 1 ? 0 : (level * (level + 1)) / 2;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside this level, out of `span`, what the whole level takes. */
  into: number;
  span: number;
  toNext: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFor(xp);
  const start = levelStart(level);
  const next = levelStart(level + 1);
  return { level, into: xp - start, span: next - start, toNext: next - xp };
}

/** The parts of a goal the economy reads. */
export interface XpGoal {
  id: string;
  isBoss: boolean;
  develops: readonly string[];
  parentIds: readonly string[];
}

/**
 * The goals a set of links credits. A boss is a milestone on its goal's path,
 * so it passes the credit up to the nearest goals above it that aren't
 * bosses. A boss with nothing above it (made by hand at the top) stands for
 * itself.
 */
export function creditedGoals(
  linkedIds: readonly string[],
  goals: ReadonlyMap<string, XpGoal>
): string[] {
  const credited = new Set<string>();
  const seen = new Set<string>();
  const visit = (id: string) => {
    const goal = goals.get(id);
    if (!goal || seen.has(id)) return;
    seen.add(id);
    const parents = goal.parentIds.filter((parentId) => goals.has(parentId));
    if (!goal.isBoss || parents.length === 0) {
      credited.add(id);
      return;
    }
    parents.forEach(visit);
  };
  linkedIds.forEach(visit);
  return [...credited];
}

/** A goal's stats: its own, or else whatever the goals above it develop. */
export function statsOf(
  id: string,
  goals: ReadonlyMap<string, XpGoal>,
  seen: Set<string> = new Set()
): StatKey[] {
  const goal = goals.get(id);
  if (!goal || seen.has(id)) return [];
  seen.add(id);
  const own = [...new Set(goal.develops.filter(isStatKey))];
  if (own.length > 0) return own;
  const inherited = new Set<StatKey>();
  for (const parentId of goal.parentIds) {
    for (const key of statsOf(parentId, goals, seen)) inherited.add(key);
  }
  return STAT_KEYS.filter((key) => inherited.has(key));
}

/** Something that earns XP: a finished task, or a felled boss. */
export interface XpSource {
  kind: "task" | "boss";
  id: string;
  /** The calendar day it counts on, YYYY-MM-DD in the user's zone. */
  day: string;
  /** A task's goal links; a boss names itself. */
  goalIds: readonly string[];
}

export interface XpEvent extends XpSource {
  /** Each credited goal and its share of the XP. */
  credit: { goalId: string; xp: number }[];
  stats: Partial<Record<StatKey, number>>;
  /** XP that reached no stat: no goal took it, or the goal develops none. */
  lost: number;
}

export function scoreEvent(source: XpSource, goals: ReadonlyMap<string, XpGoal>): XpEvent {
  const total = source.kind === "boss" ? BOSS_XP : TASK_XP;
  const credited = creditedGoals(source.goalIds, goals);
  const stats: Partial<Record<StatKey, number>> = {};
  let lost = credited.length === 0 ? total : 0;
  const credit = credited.map((goalId) => {
    const share = total / credited.length;
    const keys = statsOf(goalId, goals);
    if (keys.length === 0) lost += share;
    for (const key of keys) stats[key] = (stats[key] ?? 0) + share / keys.length;
    return { goalId, xp: share };
  });
  return { ...source, credit, stats, lost };
}

/** Per-stat sums, rounded clear of float drift: nine thirds of an XP is 3,
 *  not 2.9999999999999996, or level 2 would never arrive. */
export function sumStats(events: readonly XpEvent[]): StatXp {
  const sum = emptyStatXp();
  for (const event of events) {
    for (const key of STAT_KEYS) sum[key] += event.stats[key] ?? 0;
  }
  for (const key of STAT_KEYS) sum[key] = Math.round(sum[key] * 1e9) / 1e9;
  return sum;
}
