/**
 * Course grade arithmetic over the gradebook mirror: the current percentage
 * the way Canvas computes it, and the "if you miss this assignment" projection
 * Focus shows on DANGER cards. Pure — `load-grade-projections.ts` reads the rows.
 * @see docs/focus-mode.md §1.3, docs/SIGWALD-SPEC.md §5.2
 */

export interface GradeProjectionResult {
  currentCourseGrade: number;
  gradeIfMissed: number;
  letterGradeCurrent: string;
  letterGradeIfMissed: string;
}

export interface GradebookGroup {
  id: string;
  /** % of the course grade; ignored when the course doesn't weight groups. */
  weight: number | null;
  dropLowest: number;
  dropHighest: number;
  /** Canvas assignment ids the drop rules never drop. */
  neverDrop: string[];
}

export interface GradebookEntry {
  canvasId: string;
  groupId: string | null;
  pointsPossible: number | null;
  omitFromFinalGrade: boolean;
  state: string;
  score: number | null;
}

/** [letter, lowest fraction], best first — Canvas's `grading_scheme`. */
export type LetterScheme = Array<[string, number]>;

/** US-style scale (spec example), for courses that don't publish one. */
const DEFAULT_SCHEME: LetterScheme = [
  ["A", 0.93],
  ["A-", 0.9],
  ["B+", 0.87],
  ["B", 0.83],
  ["B-", 0.8],
  ["C+", 0.77],
  ["C", 0.73],
  ["C-", 0.7],
  ["D+", 0.67],
  ["D", 0.63],
  ["D-", 0.6],
  ["F", 0],
];

export function letterFor(percent: number, scheme?: LetterScheme | null): string {
  const scale = scheme?.length ? scheme : DEFAULT_SCHEME;
  const fraction = percent / 100;
  // Canvas compares against the cutoff with a small epsilon so 89.995 rounds into A-.
  const hit = scale.find(([, cutoff]) => fraction + 1e-9 >= cutoff);
  return hit?.[0] ?? scale[scale.length - 1][0];
}

interface Scored {
  canvasId: string;
  earned: number;
  possible: number;
}

/** Drop the lowest / highest scores in a group, by percentage, sparing `neverDrop`. */
function applyDrops(scored: Scored[], group: GradebookGroup | undefined): Scored[] {
  if (!group || (group.dropLowest <= 0 && group.dropHighest <= 0)) {
    return scored;
  }
  const spared = scored.filter((s) => group.neverDrop.includes(s.canvasId));
  const droppable = scored
    .filter((s) => !group.neverDrop.includes(s.canvasId))
    .sort((a, b) => a.earned / a.possible - b.earned / b.possible);
  // Canvas always keeps at least one score in a group.
  const low = Math.min(group.dropLowest, Math.max(0, droppable.length - 1));
  const high = Math.min(group.dropHighest, Math.max(0, droppable.length - low - 1));
  return [...spared, ...droppable.slice(low, droppable.length - high)];
}

/**
 * Points earned and possible per group (key "" for ungrouped work), counting
 * graded work only, after drop rules — what Canvas shows on each group row.
 * `overrides` scores an assignment as if graded (a miss is 0).
 */
export function groupTotals(
  entries: GradebookEntry[],
  groups: GradebookGroup[],
  overrides?: Map<string, number>
): Map<string, { earned: number; possible: number }> {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const byGroup = new Map<string, Scored[]>();
  for (const e of entries) {
    const possible = e.pointsPossible ?? 0;
    if (possible <= 0 || e.omitFromFinalGrade || e.state === "excused") {
      continue;
    }
    const override = overrides?.get(e.canvasId);
    const earned = override ?? (e.state === "graded" ? e.score : null);
    if (earned == null || !Number.isFinite(earned)) {
      continue;
    }
    const key = e.groupId ?? "";
    byGroup.set(key, [...(byGroup.get(key) ?? []), { canvasId: e.canvasId, earned, possible }]);
  }
  const totals = new Map<string, { earned: number; possible: number }>();
  for (const [groupId, scored] of byGroup) {
    const kept = applyDrops(scored, groupById.get(groupId));
    totals.set(groupId, {
      earned: kept.reduce((n, s) => n + s.earned, 0),
      possible: kept.reduce((n, s) => n + s.possible, 0),
    });
  }
  return totals;
}

/**
 * The course percentage from graded work, as Canvas's "current" score counts
 * it: ungraded, excused and omitted work doesn't count; drop rules apply per
 * group; a weighted course averages its groups by weight, rescaled over the
 * groups that have any graded work yet, and an unweighted one totals points.
 */
export function coursePercent(
  entries: GradebookEntry[],
  groups: GradebookGroup[],
  options: { weighted: boolean; overrides?: Map<string, number> }
): number | null {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  let earnedTotal = 0;
  let possibleTotal = 0;
  let weightedSum = 0;
  let weightUsed = 0;
  for (const [groupId, { earned, possible }] of groupTotals(entries, groups, options.overrides)) {
    if (possible <= 0) {
      continue;
    }
    earnedTotal += earned;
    possibleTotal += possible;
    const weight = groupById.get(groupId)?.weight ?? 0;
    if (weight > 0) {
      weightedSum += (earned / possible) * weight;
      weightUsed += weight;
    }
  }

  if (options.weighted) {
    return weightUsed > 0 ? (weightedSum / weightUsed) * 100 : null;
  }
  return possibleTotal > 0 ? (earnedTotal / possibleTotal) * 100 : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Current course grade vs. the grade if one assignment were scored 0. When
 * Canvas reports the current score, that's the anchor and Sigwald's arithmetic
 * only supplies the drop — so the number on the card matches Canvas.
 */
export function projectMissedAssignment(
  course: {
    weighted: boolean;
    canvasCurrentScore: number | null;
    scheme: LetterScheme | null;
    entries: GradebookEntry[];
    groups: GradebookGroup[];
  },
  assignmentCanvasId: string
): GradeProjectionResult | null {
  const current = coursePercent(course.entries, course.groups, { weighted: course.weighted });
  const missed = coursePercent(course.entries, course.groups, {
    weighted: course.weighted,
    overrides: new Map([[assignmentCanvasId, 0]]),
  });
  if (current == null || missed == null) {
    return null;
  }
  const anchor = course.canvasCurrentScore ?? current;
  const ifMissed = Math.max(0, anchor + (missed - current));
  return {
    currentCourseGrade: round1(anchor),
    gradeIfMissed: round1(ifMissed),
    letterGradeCurrent: letterFor(anchor, course.scheme),
    letterGradeIfMissed: letterFor(ifMissed, course.scheme),
  };
}

export interface LetterOutlook {
  letter: string;
  /** The letter's lowest percentage. */
  cutoff: number;
  /** Average needed on everything not yet graded, 0–100; null when it's already secured or out of reach. */
  needed: number | null;
  status: "secured" | "reachable" | "out_of_reach";
}

/**
 * What it takes: for each letter, the average needed on the work that isn't
 * graded yet. Missed work counts as a zero, since it can't be handed in; work
 * still open counts as remaining. Weighted courses weigh each group's share of
 * its own points; drop rules are left out, so this errs on the side of asking
 * for more.
 */
export function letterOutlook(
  entries: GradebookEntry[],
  groups: GradebookGroup[],
  options: { weighted: boolean; scheme?: LetterScheme | null; letters?: number }
): { remainingPoints: number; outlook: LetterOutlook[] } {
  const totals = new Map<string, { earned: number; graded: number; remaining: number }>();
  for (const e of entries) {
    const possible = e.pointsPossible ?? 0;
    if (possible <= 0 || e.omitFromFinalGrade || e.state === "excused") {
      continue;
    }
    const key = e.groupId ?? "";
    const t = totals.get(key) ?? { earned: 0, graded: 0, remaining: 0 };
    if (e.state === "graded" && e.score != null) {
      t.earned += e.score;
      t.graded += possible;
    } else if (e.state === "missed") {
      t.graded += possible;
    } else {
      t.remaining += possible;
    }
    totals.set(key, t);
  }

  const weightOf = new Map(groups.map((g) => [g.id, g.weight ?? 0]));
  let a = 0;
  let b = 0;
  let w = 0;
  let remainingPoints = 0;
  for (const [groupId, t] of totals) {
    const all = t.graded + t.remaining;
    remainingPoints += t.remaining;
    if (all <= 0) continue;
    const weight = options.weighted ? (weightOf.get(groupId) ?? 0) : all;
    if (weight <= 0) continue;
    a += (weight * t.earned) / all;
    b += (weight * t.remaining) / all;
    w += weight;
  }
  // final(x) = (a + b·x) / w, x = the fraction earned on what's left.
  const scale = (options.scheme?.length ? options.scheme : DEFAULT_SCHEME).filter(([, cutoff]) => cutoff > 0);
  const outlook = scale.slice(0, options.letters ?? scale.length).map(([letter, cutoff]): LetterOutlook => {
    if (w <= 0) return { letter, cutoff: cutoff * 100, needed: null, status: "out_of_reach" };
    const target = cutoff * w;
    if (b <= 0) {
      return { letter, cutoff: cutoff * 100, needed: null, status: a + 1e-9 >= target ? "secured" : "out_of_reach" };
    }
    const x = (target - a) / b;
    if (x <= 0) return { letter, cutoff: cutoff * 100, needed: null, status: "secured" };
    if (x > 1) return { letter, cutoff: cutoff * 100, needed: null, status: "out_of_reach" };
    return { letter, cutoff: cutoff * 100, needed: Math.round(x * 1000) / 10, status: "reachable" };
  });
  return { remainingPoints, outlook };
}
