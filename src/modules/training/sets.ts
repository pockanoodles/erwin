/**
 * What a session holds: lines of sets × reps at a weight, and how a new one
 * starts from the plan and last time. Pure, so the server (a workout task's
 * description) and the page (the log form) start from the same numbers.
 */

export type Unit = "kg" | "lb";

export const UNITS: readonly Unit[] = ["kg", "lb"];

export const isUnit = (u: unknown): u is Unit => u === "kg" || u === "lb";

/** One planned exercise: what a session aims for, without weights. */
export interface PlannedExercise {
  name: string;
  sets: number;
  reps: number | null;
}

/** One line of a session. */
export interface Entry {
  exercise: string;
  sets: number;
  reps: number | null;
  /** In the session's unit; null for bodyweight. */
  weight: number | null;
}

/** A past session, as much of it as starting a new one needs. */
export interface PastSession {
  unit: Unit;
  entries: Entry[];
}

const LB_PER_KG = 2.2046226218;

/** A weight in another unit, to the nearest half: plates don't come finer. */
export function convertWeight(weight: number, from: Unit, to: Unit): number {
  if (from === to) return weight;
  const raw = from === "kg" ? weight * LB_PER_KG : weight / LB_PER_KG;
  return Math.round(raw * 2) / 2;
}

const key = (name: string) => name.trim().toLowerCase();

const inUnit = (entry: Entry, from: Unit, to: Unit): Entry => ({
  ...entry,
  weight: entry.weight == null ? null : convertWeight(entry.weight, from, to),
});

/**
 * Where a new session starts. Each planned exercise brings its lines from
 * the latest session that did it, weights included, or the plan's sets and
 * reps with no weight if it's never been done. A routine with no plan
 * repeats its latest session. `history` is newest first.
 */
export function prefillEntries(
  plan: readonly PlannedExercise[],
  history: readonly PastSession[],
  unit: Unit
): Entry[] {
  if (plan.length === 0) {
    const last = history.find((s) => s.entries.length > 0);
    return last ? last.entries.map((e) => inUnit(e, last.unit, unit)) : [];
  }
  return plan.flatMap((p) => {
    for (const session of history) {
      const lines = session.entries.filter(
        (e) => key(e.exercise) === key(p.name)
      );
      if (lines.length > 0)
        return lines.map((e) => inUnit(e, session.unit, unit));
    }
    return [{ exercise: p.name, sets: p.sets, reps: p.reps, weight: null }];
  });
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "3 × 8 @ 60 kg", "3 × 12", "1 × 5 @ 102.5 kg". */
export function entryText(entry: Entry, unit: Unit): string {
  const volume =
    entry.reps != null ? `${entry.sets} × ${entry.reps}` : `${entry.sets} sets`;
  return entry.weight != null
    ? `${volume} @ ${num(entry.weight)} ${unit}`
    : volume;
}

/** "Bench press 3 × 8 @ 60 kg": one line of a session, named. */
export const entryLine = (entry: Entry, unit: Unit) =>
  `${entry.exercise} ${entryText(entry, unit)}`;

/** A session in one line, for lists: "Bench press 3 × 8 @ 60 kg · Dips 3 × 12". */
export function sessionSummary(entries: readonly Entry[], unit: Unit): string {
  return entries.map((e) => entryLine(e, unit)).join(" · ");
}

/** Lines a person left empty or half typed don't count. */
export function keptEntries(entries: readonly Entry[]): Entry[] {
  return entries
    .map((e) => ({ ...e, exercise: e.exercise.trim() }))
    .filter((e) => e.exercise.length > 0 && e.sets > 0);
}
