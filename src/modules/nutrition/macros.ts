/**
 * A day's eating against its targets, and how the page and the top bar say
 * it. Pure, so they agree and tests need no database.
 */
import { daysBetween } from "@/lib/date-utils";

export const MACROS = ["calories", "protein", "carbs", "fat"] as const;

export type Macro = (typeof MACROS)[number];

/** Amounts of each: kcal for calories, grams for the rest. */
export type Macros = Record<Macro, number>;

/** A day's targets; null where one isn't tracked. */
export type Targets = Record<Macro, number | null>;

export const MACRO_NAMES: Record<Macro, string> = {
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
};

export const MACRO_UNITS: Record<Macro, string> = {
  calories: "kcal",
  protein: "g",
  carbs: "g",
  fat: "g",
};

export const NO_TARGETS: Targets = {
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
};

const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

/** One entry's amounts: per serving, times its servings. */
export function entryMacros(entry: Macros & { servings: number }): Macros {
  return {
    calories: entry.calories * entry.servings,
    protein: entry.protein * entry.servings,
    carbs: entry.carbs * entry.servings,
    fat: entry.fat * entry.servings,
  };
}

/** Everything eaten in a day. */
export function dayTotals(
  entries: readonly (Macros & { servings: number })[]
): Macros {
  return entries.map(entryMacros).reduce(
    (sum, e) => ({
      calories: sum.calories + e.calories,
      protein: sum.protein + e.protein,
      carbs: sum.carbs + e.carbs,
      fat: sum.fat + e.fat,
    }),
    ZERO
  );
}

/** What's left of each target, below zero once it's passed; null where there's none. */
export function leftOf(eaten: Macros, targets: Targets): Targets {
  const left = (m: Macro) => {
    const target = targets[m];
    return target == null ? null : target - eaten[m];
  };
  return {
    calories: left("calories"),
    protein: left("protein"),
    carbs: left("carbs"),
    fat: left("fat"),
  };
}

/** "1,450", "92": an amount the way the page prints it, whole. */
export function amount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** "62 left", "12 over", "met", for one macro against its target. */
export function leftLabel(macro: Macro, left: number): string {
  const n = Math.round(left);
  if (n > 0) return `${amount(n)} left`;
  if (n === 0 || macro === "protein") return "met";
  return `${amount(-n)} over`;
}

/**
 * The top bar's one count: the protein still to eat today when there's a
 * protein target, else the calories left; null with neither.
 */
export function statusCount(eaten: Macros, targets: Targets): string | null {
  const left = leftOf(eaten, targets);
  if (left.protein != null) {
    return left.protein >= 0.5
      ? `${amount(left.protein)} g protein left`
      : "Protein met";
  }
  if (left.calories != null) {
    return left.calories >= 0
      ? `${amount(left.calories)} kcal left`
      : `${amount(-left.calories)} kcal over`;
  }
  return null;
}

/** A day is written "2026-10-25". */
export function isDay(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** "Today", "Yesterday", "Tomorrow", or "Sat, Oct 24". */
export function dayTitle(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
