/**
 * Boss proof: how Erwin knows a boss was beaten without anyone ticking a box.
 * A boss names its proof, an item a module keeps (Courses: a Canvas
 * gradebook item, read through the module registry's `proofItems`) or
 * another task, and the proof settles it (lib/erwin/goal-rules.ts): handing
 * the work in, a grade or being excused fells the boss, and the item's due
 * date wins over the boss's own. A boss with no proof is marked by hand,
 * with a ✅ on its vault heading or Done in Erwin.
 *
 * Pure, so the server and the boss form share one reading of the evidence.
 */

import type { ProofItem } from "@/modules/types";

export type ProofState = "open" | "done" | "missed";

export interface BossProof {
  /** Where Erwin looks. Null: nowhere, so the boss is marked by hand. */
  source: "canvas" | "task" | null;
  state: ProofState;
  /** What it says, e.g. "Graded 90 / 100", "Handed in", "Missed". */
  label: string;
}

/** A boss whose proof is a module's item, as that item reads now. */
export function itemProof(item: ProofItem | undefined): BossProof {
  return item
    ? { source: "canvas", state: item.state, label: item.label }
    : { source: "canvas", state: "open", label: "Not in your gradebook yet" };
}

export function taskProof(task: { status: string }): BossProof {
  return task.status === "completed"
    ? { source: "task", state: "done", label: "Done in Tasks" }
    : { source: "task", state: "open", label: "Open in Tasks" };
}

export function selfProof(status: string): BossProof {
  return status === "done"
    ? { source: null, state: "done", label: "Marked done" }
    : { source: null, state: "open", label: "You mark it" };
}

/** A Canvas item a boss could be. */
export interface ProofCandidate {
  canvasId: string;
  name: string;
  /** Canvas's course code, e.g. "SCHM2301.10244.202710". */
  courseCode: string | null;
  /** YYYY-MM-DD, or null when Canvas gives it no date. */
  dueDay: string | null;
}

const KINDS: [RegExp, string][] = [
  [/^(exam|exams|test|tests|midterm|midterms|quiz|quizzes)$/, "exam"],
  [/^(presentation|presentations|pitch|slides|deck)$/, "present"],
  [/^(project|projects|paper|papers|report|essay)$/, "project"],
  [/^(case|cases)$/, "case"],
  [/^(module|modules)$/, "module"],
];
const STOP = new Set(["the", "and", "for", "with", "requires", "respondus", "lockdown", "browser", "webcam", "submit", "here", "upload", "final", "due"]);

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .split(" ")
    .filter(Boolean);

const kindOf = (word: string) => KINDS.find(([re]) => re.test(word))?.[1] ?? null;

/** "SCHM2301" from a title or from Canvas's "SCHM2301.10244.202710". */
const codesIn = (text: string) => [...text.matchAll(/\b([A-Z]{2,5})\s?(\d{4})\b/g)].map((m) => `${m[1]}${m[2]}`);

interface Reading {
  codes: string[];
  kinds: Set<string>;
  /** The number after the first kind word: "Test #2" → 2. A midterm with none is the first exam. */
  ordinal: number | null;
  words: Set<string>;
}

function read(text: string): Reading {
  const tokens = words(text);
  const kinds = new Set<string>();
  let ordinal: number | null = null;
  tokens.forEach((token, i) => {
    const kind = kindOf(token);
    if (!kind) return;
    kinds.add(kind);
    const next = tokens[i + 1]?.replace("#", "");
    if (ordinal === null && next && /^\d{1,2}$/.test(next)) ordinal = Number(next);
    if (ordinal === null && token.startsWith("midterm")) ordinal = 1;
  });
  return {
    codes: codesIn(text),
    kinds,
    ordinal,
    words: new Set(tokens.filter((t) => t.length > 2 && !STOP.has(t) && !kindOf(t) && !/^#?\d+$/.test(t))),
  };
}

const dayGap = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

function score(boss: Reading, bossDay: string | null, item: ProofCandidate): number {
  const it = read(item.name);
  const itemCode = item.courseCode ? codesIn(item.courseCode)[0] ?? null : null;
  let points = 0;
  if (boss.codes.length) {
    if (!itemCode) return -Infinity;
    if (boss.codes.includes(itemCode)) points += 3;
    // MKTG2209 in the vault is MKTG2201 in Canvas: same subject, weaker.
    else if (boss.codes.some((code) => code.slice(0, -4) === itemCode.slice(0, -4))) points += 1;
    else return -Infinity;
  }
  if ([...boss.kinds].some((kind) => it.kinds.has(kind))) points += 2;
  if (boss.ordinal !== null && it.ordinal !== null) points += boss.ordinal === it.ordinal ? 2 : -3;
  if (bossDay && item.dueDay) {
    const gap = dayGap(bossDay, item.dueDay);
    points += gap <= 1 ? 2 : gap <= 4 ? 1 : gap > 30 ? -1 : 0;
  }
  points += Math.min(2, [...boss.words].filter((w) => it.words.has(w)).length);
  return points;
}

/**
 * The Canvas item a boss most likely is, or null when nothing fits well or two
 * fit equally: a suggestion for a person to confirm, never a binding Erwin
 * makes alone. Course code, the kind of work, its number and the date decide
 * it. Pass only items no other boss is bound to.
 */
export function suggestProof(
  boss: { title: string; day: string | null },
  candidates: readonly ProofCandidate[]
): ProofCandidate | null {
  const reading = read(boss.title);
  const ranked = candidates
    .map((item) => ({ item, points: score(reading, boss.day, item) }))
    .filter((r) => Number.isFinite(r.points))
    .sort((a, b) => b.points - a.points);
  const [best, next] = ranked;
  if (!best || best.points < 5) return null;
  if (next && best.points - next.points < 2) return null;
  return best.item;
}
