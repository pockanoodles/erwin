/**
 * The 8-stat character-sheet vocabulary (Elden Ring structure).
 *
 * This is the same fixed legend as brain/_map.md and ops' STAT_KEYS — the three
 * systems share it by convention, not by import. If a key ever changes there,
 * it changes here. XP is derived from completion history on read and never
 * stored (lib/sigwald/xp.ts holds the economy).
 */
export const STAT_KEYS = [
  "vigor",
  "mind",
  "endurance",
  "strength",
  "dexterity",
  "intelligence",
  "faith",
  "arcane",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_ABBREV: Record<StatKey, string> = {
  vigor: "VIG",
  mind: "MND",
  endurance: "END",
  strength: "STR",
  dexterity: "DEX",
  intelligence: "INT",
  faith: "FAI",
  arcane: "ARC",
};

export const STAT_NAMES: Record<StatKey, string> = {
  vigor: "Vigor",
  mind: "Mind",
  endurance: "Endurance",
  strength: "Strength",
  dexterity: "Dexterity",
  intelligence: "Intelligence",
  faith: "Faith",
  arcane: "Arcane",
};

/** What each stat stands for, condensed from the map's legend. */
export const STAT_MEANINGS: Record<StatKey, string> = {
  vigor: "Health, energy and sleep",
  mind: "Focus and stress headroom",
  endurance: "Consistency and steady routines",
  strength: "Shipping and getting things done",
  dexterity: "Craft and range across tools",
  intelligence: "Formal knowledge and study",
  faith: "Conviction and personal growth",
  arcane: "Discovery, luck and opportunity",
};

export function isStatKey(value: string): value is StatKey {
  return (STAT_KEYS as readonly string[]).includes(value);
}

/** Validate an incoming stat list: unknown keys rejected, duplicates dropped, order preserved. */
export function sanitizeStatKeys(values: unknown): StatKey[] | null {
  if (!Array.isArray(values)) return null;
  const out: StatKey[] = [];
  for (const v of values) {
    if (typeof v !== "string" || !isStatKey(v)) return null;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}
