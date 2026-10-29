import type { Macros, Targets } from "@/modules/nutrition/macros";

/** Something eaten, as the Nutrition API sends it: amounts per serving. */
export interface EntryRow extends Macros {
  id: string;
  /** The day it counts toward: "2026-10-25". */
  day: string;
  foodId: string | null;
  name: string;
  serving: string | null;
  servings: number;
}

/** A saved food: amounts per serving. */
export interface FoodRow extends Macros {
  id: string;
  name: string;
  serving: string | null;
  lastUsedAt: string | null;
  archived: boolean;
}

/** GET /api/sigwald/nutrition/day */
export interface DayRow {
  day: string;
  entries: EntryRow[];
  targets: Targets;
}

/** A food as the page sends it, saved or not. */
export interface FoodInput extends Macros {
  name: string;
  serving: string | null;
}

/** POST /api/sigwald/nutrition/entries: a saved food, or one typed in (and maybe saved). */
export type EntryInput = { day: string; servings: number } & (
  | { foodId: string }
  | { food: FoodInput; save: boolean }
);
