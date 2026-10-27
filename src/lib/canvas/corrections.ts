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
    // answer. Canvas taking the work in or grading it is.
    return DONE_STATES.has(raw.state) ? `Canvas now says ${raw.state}` : null;
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
 * first. `applied` lists only corrections that changed something.
 */
export function applyCorrections(
  raw: PlannedAssignment,
  corrections: Correction[],
  timeZone: string
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
  for (const c of ordered) {
    const note = retiredBy(c, raw, timeZone);
    if (note) {
      retired.push({ id: c.id, field: c.field, note });
      continue;
    }
    const value = correctedValue(c, plan, timeZone);
    if (value === undefined) {
      continue;
    }
    const field = c.field as CorrectionField;
    (plan as Record<CorrectionField, unknown>)[field] = value;
    winners.set(field, c);
  }

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
 * The last sync's row as the activity diff should see it. A change Kaito made
 * himself — a correction applied or deleted since — isn't news, so on those
 * fields the baseline already holds the new value. A retirement is Canvas
 * changing its answer, which is.
 */
export function activityBaseline<T extends { dueAt: Date | null; state: string }>(
  prev: T | undefined,
  prevApplied: AppliedCorrection[],
  next: { plan: PlannedAssignment; applied: AppliedCorrection[]; retired: Retirement[] }
): T | undefined {
  if (!prev) {
    return prev;
  }
  const ids = (list: AppliedCorrection[], field: string) =>
    list.filter((a) => a.field === field).map((a) => a.id).join(",");
  const canvasMoved = new Set(next.retired.map((r) => r.field));
  const baseline = { ...prev };
  for (const field of ["dueAt", "state"] as const) {
    if (!canvasMoved.has(field) && ids(prevApplied, field) !== ids(next.applied, field)) {
      (baseline as Record<string, unknown>)[field] = next.plan[field];
    }
  }
  return baseline;
}

/** Applied corrections as stored in the `corrections` Json column. */
export function storedCorrections(value: unknown): AppliedCorrection[] {
  return Array.isArray(value) ? (value as AppliedCorrection[]) : [];
}
