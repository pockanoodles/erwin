/**
 * The 8-stat character-sheet vocabulary (Elden Ring structure).
 *
 * This is the same fixed legend as brain/_map.md and ops' STAT_KEYS — the three
 * systems share it by convention, not by import. If a key ever changes there,
 * it changes here. Erwin only stores and displays stat structure; XP/rune math
 * stays in ops (derived from completion history, never stored).
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
