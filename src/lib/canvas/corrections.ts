/**
 * Corrections: where Canvas is wrong about an assignment, laid over what it
 * says. A teammate handed in the group copy, so this student's row reads
 * "missed"; Connect closes at noon while Canvas says 11:59pm. One shape
 * covers them all — a field, and what's true instead — so a new kind of
 * mistake is a new row, not new code.
 *
 * Canvas stays the source of truth. Each applied correction keeps what Canvas
 * said, and one made for a single assignment retires itself the moment Canvas
 * changes that answer (the teacher fixed it, or moved the date) instead of
 * hiding the change. A course rule has no single answer to watch, so it holds
 * until it's deleted. No IO — `sync-canvas-gradebook.ts` reads and writes.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { formatWhen } from "@/lib/canvas/activity-plan";
import {
  DONE_STATES,
  type PlannedAssignment,
  SUBMISSION_STATES,
} from "@/lib/canvas/gradebook-plan";
import type { AppliedCorrection } from "@/types/gradebook";

export type { AppliedCorrection };

export const CORRECTION_FIELDS = ["state", "dueAt", "lockAt"] as const;
export type CorrectionField = (typeof CORRECTION_FIELDS)[number];

/** `set` writes the value; `setTime` keeps Canvas's day and sets the clock ("12:00", the course's zone). */
export const CORRECTION_OPS = ["set", "setTime"] as const;
export type CorrectionOp = (typeof CORRECTION_OPS)[number];

/** A CanvasCorrection row, as much of it as applying needs. */
export interface Correction {
  id: string;
  assignmentCanvasId: string | null;
  nameMatch: string | null;
  submissionType: string | null;
  field: string;
  op: string;
  value: string;
  reason: string;
  canvasValue: string | null;
  createdAt: Date;
}

export interface Retirement {
  id: string;
  field: string;
  /** "Canvas now says graded", "Canvas moved it: Fri, Oct 9, 11:59 PM → Mon, Oct 12, 11:59 PM". */
  note: string;
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Why a correction can't be stored, or null when it can. The API asks before writing one. */
export function correctionProblem(c: {
  field: string;
  op: string;
  value: string;
  assignmentCanvasId?: string | null;
  nameMatch?: string | null;
  submissionType?: string | null;
}): string | null {
  if (!(CORRECTION_FIELDS as readonly string[]).includes(c.field)) {
    return `field must be one of ${CORRECTION_FIELDS.join(", ")}`;
  }
  if (c.field === "state") {
    if (c.op !== "set") return "state only takes op set";
    if (!(SUBMISSION_STATES as readonly string[]).includes(c.value)) {
      return `state must be one of ${SUBMISSION_STATES.join(", ")}`;
    }
  } else if (c.op === "set") {
    if (Number.isNaN(Date.parse(c.value))) return "set on a date takes an ISO date-time";
  } else if (c.op === "setTime") {
    if (!HH_MM.test(c.value)) return 'setTime takes "HH:mm"';
  } else {
    return `op must be one of ${CORRECTION_OPS.join(", ")}`;
  }
  if (c.assignmentCanvasId == null) {
    // A rule with no filter would rewrite every assignment in the course.
    if (!c.nameMatch && !c.submissionType) return "a course rule needs nameMatch or submissionType";
    if (c.nameMatch && !namePattern(c.nameMatch)) return "nameMatch is not a valid regex";
  }
  return null;
}

function namePattern(source: string): RegExp | null {
  try {
    return new RegExp(source, "i");
  } catch {
    return null;
  }
}

/** What Canvas says for a field, the way a correction stores it. */
export function canvasValue(plan: PlannedAssignment, field: CorrectionField): string | null {
  const v = plan[field];
  return v instanceof Date ? v.toISOString() : (v ?? null);
}

export function correctionMatches(c: Correction, plan: PlannedAssignment): boolean {
  if (c.assignmentCanvasId != null) {
    return c.assignmentCanvasId === plan.canvasId;
  }
  if (!c.nameMatch && !c.submissionType) {
    return false;
  }
  if (c.submissionType && !plan.submissionTypes.includes(c.submissionType)) {
    return false;
  }
  return !c.nameMatch || Boolean(namePattern(c.nameMatch)?.test(plan.name));
}

function shown(value: string | null, field: string, timeZone: string): string {
  if (value == null) return "none";
  return field === "state" ? value : formatWhen(new Date(value), timeZone);
}

/** Why a one-assignment correction no longer applies, or null while it does. */
function retiredBy(c: Correction, raw: PlannedAssignment, timeZone: string): string | null {
  if (c.assignmentCanvasId == null) {
    return null;
  }
  const field = c.field as CorrectionField;
  if (field === "state") {
    // Moving between open states (missing → missed) is the clock, not anyone's
    // answer. Canvas taking the work in, grading it or reopening it is.
    const was = c.canvasValue ?? "";
    const changed = raw.state !== was && (DONE_STATES.has(raw.state) || DONE_STATES.has(was));
    return changed ? `Canvas now says ${raw.state}` : null;
  }
  const now = canvasValue(raw, field);
  return now === c.canvasValue
    ? null
    : `Canvas moved it: ${shown(c.canvasValue, field, timeZone)} → ${shown(now, field, timeZone)}`;
}

function correctedValue(
  c: Correction,
  plan: PlannedAssignment,
  timeZone: string
): PlannedAssignment[CorrectionField] | undefined {
  const field = c.field as CorrectionField;
  if (field === "state") {
    return c.value as PlannedAssignment["state"];
  }
  if (c.op === "set") {
    return new Date(c.value);
  }
  const current = plan[field];
  if (!current) {
    // No date to set the time of.
    return undefined;
  }
  const day = formatInTimeZone(current, timeZone, "yyyy-MM-dd");
  return fromZonedTime(`${day}T${c.value}:00`, timeZone);
}

/**
 * The assignment as Erwin should see it: Canvas's plan with every live
 * correction that matches laid on top. Course rules go first and corrections
 * for one assignment after, so the specific one wins; within each, oldest
 * first. Dates go before state: a corrected date can change what the state
 * is (a lock moved into the future reopens "missed" work), so `stateFor`
 * works it out again from them, and a state correction still has the last
 * word. `applied` lists only corrections that changed something.
 */
export function applyCorrections(
  raw: PlannedAssignment,
  corrections: Correction[],
  timeZone: string,
  stateFor?: (dates: Pick<PlannedAssignment, "dueAt" | "lockAt">) => PlannedAssignment["state"]
): { plan: PlannedAssignment; applied: AppliedCorrection[]; retired: Retirement[] } {
  const ordered = corrections
    .filter((c) => correctionMatches(c, raw))
    .sort(
      (a, b) =>
        Number(a.assignmentCanvasId != null) - Number(b.assignmentCanvasId != null) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
  const plan = { ...raw };
  const winners = new Map<CorrectionField, Correction>();
  const retired: Retirement[] = [];
  const live = ordered.filter((c) => {
    const note = retiredBy(c, raw, timeZone);
    if (note) retired.push({ id: c.id, field: c.field, note });
    return !note;
  });
  const lay = (c: Correction) => {
    const value = correctedValue(c, plan, timeZone);
    if (value === undefined) {
      return;
    }
    const field = c.field as CorrectionField;
    (plan as Record<CorrectionField, unknown>)[field] = value;
    winners.set(field, c);
  };
  live.filter((c) => c.field !== "state").forEach(lay);
  const dateWinner = winners.get("lockAt") ?? winners.get("dueAt");
  if (stateFor && dateWinner) {
    plan.state = stateFor(plan);
    winners.set("state", dateWinner);
  }
  live.filter((c) => c.field === "state").forEach(lay);

  const applied: AppliedCorrection[] = [];
  for (const [field, c] of winners) {
    const canvas = canvasValue(raw, field);
    const value = canvasValue(plan, field);
    if (value !== canvas) {
      applied.push({ id: c.id, field, canvas, value, reason: c.reason });
    }
  }
  return { plan, applied, retired };
}

/**
 * Whether Kaito changed this assignment's corrections since `since` (its last
 * sync): one that matches was made, or deleted or replaced (both retire it).
 */
export function correctionsChangedSince(
  all: (Correction & { retiredAt: Date | null })[],
  plan: PlannedAssignment,
  since: Date | null
): boolean {
  return all.some(
    (c) =>
      correctionMatches(c, plan) &&
      (since == null || c.createdAt > since || (c.retiredAt != null && c.retiredAt > since))
  );
}

/**
 * The last sync's row as the activity diff should see it. News is Canvas
 * changing its answer, or the clock (a corrected lock passing). A field whose
 * Canvas value didn't move, on an assignment whose corrections Kaito just
 * changed, moved because of what he did, so there the baseline already holds
 * the new value.
 */
export function activityBaseline<T extends { dueAt: Date | null; state: string }>(
  prev: T | undefined,
  prevApplied: AppliedCorrection[],
  raw: PlannedAssignment,
  plan: PlannedAssignment,
  correctionsChanged: boolean
): T | undefined {
  if (!prev || !correctionsChanged) {
    return prev;
  }
  const baseline = { ...prev };
  for (const field of ["dueAt", "state"] as const) {
    const entry = prevApplied.find((a) => a.field === field);
    const stored = prev[field];
    const was = entry ? entry.canvas : stored instanceof Date ? stored.toISOString() : stored;
    if (was === canvasValue(raw, field)) {
      (baseline as Record<string, unknown>)[field] = plan[field];
    }
  }
  return baseline;
}

/**
 * Whether a correction alone had this work handed in and that's over: the
 * last sync applied a done state Canvas didn't have, and now nothing does.
 * Its task reopens instead of staying completed like a hand-ticked one.
 */
export function correctionUndone(prevApplied: AppliedCorrection[], plan: PlannedAssignment): boolean {
  const was = prevApplied.find((a) => a.field === "state");
  return (
    was != null &&
    DONE_STATES.has(was.value ?? "") &&
    !DONE_STATES.has(was.canvas ?? "") &&
    !DONE_STATES.has(plan.state)
  );
}

/** Applied corrections as stored in the `corrections` Json column. */
export function storedCorrections(value: unknown): AppliedCorrection[] {
  return Array.isArray(value) ? (value as AppliedCorrection[]) : [];
}
