/**
 * Erwin Stage 1 ranking (deterministic): filters + simple ordering.
 * Full spec: deadline pressure, effort fit, urgency tiers — expand here incrementally.
 */

import type { Task } from "@prisma/client";

export type TaskForRanking = Pick<
  Task,
  | "id"
  | "title"
  | "status"
  | "dueDate"
  | "unlockAt"
  | "lockAt"
  | "duration"
  | "gradeImpactScore"
  | "submissionStatus"
  | "source"
>;

const COMPLETED_STATUSES = new Set(["completed"]);
const DONE_SUBMISSION = new Set(["submitted", "graded"]);

/**
 * DANGER tier (spec §5.2.2): too little time left vs estimated effort, or overdue.
 */
export function isDangerForFocus(task: TaskForRanking, now: Date): boolean {
  if (COMPLETED_STATUSES.has(task.status)) {
    return false;
  }
  const estMinutes = task.duration ?? 30;
  const due = task.dueDate ? new Date(task.dueDate) : null;
  if (!due) {
    return false;
  }
  const minutesUntil = (due.getTime() - now.getTime()) / 60_000;
  if (minutesUntil < 0) {
    if (task.lockAt && now <= new Date(task.lockAt)) {
      return true;
    }
    return true;
  }
  return minutesUntil < estMinutes * 3;
}

/**
 * Filters tasks that should never surface in Focus (completed, locked, etc.).
 */
export function filterTasksForRanking(
  tasks: TaskForRanking[],
  now: Date
): TaskForRanking[] {
  return tasks.filter((t) => {
    if (COMPLETED_STATUSES.has(t.status)) {
      return false;
    }
    if (t.submissionStatus && DONE_SUBMISSION.has(t.submissionStatus)) {
      return false;
    }
    if (t.unlockAt && new Date(t.unlockAt) > now) {
      return false;
    }
    return true;
  });
}

/**
 * Ordering: DANGER first, then grade impact (desc), due date (asc), title.
 * //todo: replace with spec §5.2 baseScore + effort fit + calendar slots.
 */
export function orderTasksStage1(
  tasks: TaskForRanking[],
  now: Date
): TaskForRanking[] {
  return [...tasks].sort((a, b) => {
    const da = isDangerForFocus(a, now) ? 1 : 0;
    const db = isDangerForFocus(b, now) ? 1 : 0;
    if (db !== da) {
      return db - da;
    }
    const ga = a.gradeImpactScore ?? 0;
    const gb = b.gradeImpactScore ?? 0;
    if (gb !== ga) {
      return gb - ga;
    }
    const dta = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const dtb = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (dta !== dtb) {
      return dta - dtb;
    }
    return a.title.localeCompare(b.title);
  });
}

/**
 * Returns the single top task for Focus Mode (Stage 1 only).
 */
export function pickTopTaskStage1(
  tasks: TaskForRanking[],
  now: Date
): TaskForRanking | null {
  const filtered = filterTasksForRanking(tasks, now);
  const candidates = orderTasksStage1(filtered, now);
  return candidates[0] ?? null;
}
