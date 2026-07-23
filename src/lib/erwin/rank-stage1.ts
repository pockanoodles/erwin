/**
 * Erwin Stage 1 ranking (deterministic): filters, urgency tiers, base score, personal filler lane.
 * Spec: technical spec §5.2 (May 1, 2026).
 */

import type { Task } from "@prisma/client";

const W_IMPACT = 0.35;
const W_DEADLINE = 0.45;
const W_EFFORT = 0.2;
const K_SIGMOID = 0.15;
const HOURS_MIDPOINT = 48;
const VISIBILITY_BOOST = 0.15;
const LATE_PENALTY_PER_DAY = 0.1;

export type UrgencyTier = "DANGER" | "HIGH" | "NORMAL" | "LOW" | "NONE";

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
  | "category"
  | "priority"
  | "pointsPossible"
  | "courseId"
  | "skipCount"
  | "createdAt"
> & {
  /**
   * Erwin v2.2: importance (0–100) of the linked Goal, if any. Resolved by the
   * orchestration layer (`focus-queue-core`) from the `goal` relation and fed
   * into the impact term parallel to gradeImpactScore. `null` when unlinked.
   */
  goalImportanceScore?: number | null;
};

const COMPLETED_STATUSES = new Set(["completed"]);
const DONE_SUBMISSION = new Set(["submitted", "graded"]);

function hoursUntilDueDate(task: TaskForRanking, now: Date): number | null {
  if (!task.dueDate) {
    return null;
  }
  return (new Date(task.dueDate).getTime() - now.getTime()) / 3_600_000;
}

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
 * Skip spiral escalation to DANGER (spec §5.3.6): high-impact task skipped often with deadline near.
 */
export function isSkipSpiralDanger(task: TaskForRanking, now: Date): boolean {
  if ((task.skipCount ?? 0) < 3) {
    return false;
  }
  if ((task.gradeImpactScore ?? 0) <= 0.5) {
    return false;
  }
  const h = hoursUntilDueDate(task, now);
  if (h == null || h < 0) {
    return false;
  }
  return h <= 24 * 5;
}

export function isDangerResolved(
  task: TaskForRanking,
  now: Date
): boolean {
  return isDangerForFocus(task, now) || isSkipSpiralDanger(task, now);
}

/**
 * Spec §5.2.4 — sigmoid deadline pressure; late-but-before-lock stays at max; no due date → 0.
 */
export function deadlinePressure(task: TaskForRanking, now: Date): number {
  if (!task.dueDate) {
    return 0;
  }
  const due = new Date(task.dueDate);
  const lock = task.lockAt ? new Date(task.lockAt) : null;
  const hoursUntil = (due.getTime() - now.getTime()) / 3_600_000;

  if (hoursUntil < 0) {
    if (lock && now.getTime() <= lock.getTime()) {
      return 1;
    }
    return 1;
  }

  return 1 / (1 + Math.exp(K_SIGMOID * (hoursUntil - HOURS_MIDPOINT)));
}

/**
 * Late penalty on grade importance after due_at (spec §5.2.4).
 */
export function effectiveGradeImpact(task: TaskForRanking, now: Date): number {
  const g = task.gradeImpactScore ?? 0;
  if (!task.dueDate) {
    return g;
  }
  const due = new Date(task.dueDate);
  if (now.getTime() <= due.getTime()) {
    return g;
  }
  const lock = task.lockAt ? new Date(task.lockAt) : null;
  if (lock && now.getTime() > lock.getTime()) {
    return Math.max(0.05, g * 0.5);
  }
  const daysLate = Math.floor(
    (now.getTime() - due.getTime()) / 86_400_000
  );
  const penalty = Math.min(0.9, LATE_PENALTY_PER_DAY * Math.max(0, daysLate));
  return Math.max(0.05, g * (1 - penalty));
}

/**
 * Erwin v2.2 — goal importance as a 0–1 impact signal parallel to grade impact.
 * `goalImportanceScore` is a user-set 0–100 value on the linked Goal; unlinked
 * tasks contribute 0 so grade-only behavior is unchanged.
 */
export function effectiveGoalImpact(task: TaskForRanking): number {
  const g = task.goalImportanceScore;
  if (g == null) {
    return 0;
  }
  return Math.min(1, Math.max(0, g / 100));
}

/**
 * Raw (pre-pool-normalization) impact for a task: the stronger of its grade
 * impact and its goal impact. A task surfaces on its best reason to matter (a
 * big grade OR an important personal goal); taking the max avoids
 * double-counting a task that is both.
 */
function rawImpact(task: TaskForRanking, now: Date): number {
  return Math.max(effectiveGradeImpact(task, now), effectiveGoalImpact(task));
}

/**
 * Spec §5.2.5 — effort fit vs available slot (0–1).
 */
export function effortFit(estimatedMinutes: number, slotMinutes: number): number {
  const est = Math.max(1, estimatedMinutes);
  const slot = Math.max(1, slotMinutes);
  return 1 - Math.abs(est - slot) / Math.max(est, slot);
}

function percentile80(values: number[]): number {
  if (values.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.8 * s.length) - 1;
  return s[Math.max(0, idx)] ?? Number.POSITIVE_INFINITY;
}

function coursePointsList(
  candidates: TaskForRanking[],
  courseId: string | null
): number[] {
  if (!courseId) {
    return [];
  }
  return candidates
    .filter((t) => t.courseId === courseId && t.source === "CANVAS")
    .map((t) => t.pointsPossible ?? 0);
}

/**
 * Long-horizon visibility boost (spec §5.2.7).
 */
export function visibilityBoost(
  task: TaskForRanking,
  candidates: TaskForRanking[],
  now: Date
): number {
  const h = hoursUntilDueDate(task, now);
  if (h == null || h <= 24 * 7) {
    return 0;
  }
  const pts = task.pointsPossible ?? 0;
  if (pts <= 0 || task.source !== "CANVAS") {
    return 0;
  }
  const list = coursePointsList(candidates, task.courseId ?? null);
  const p80 = percentile80(list);
  if (!Number.isFinite(p80) || pts <= p80) {
    return 0;
  }
  return VISIBILITY_BOOST;
}

/**
 * Assign urgency tier (spec §5.2.2). DANGER uses resolved danger (including skip spiral).
 */
export function computeUrgencyTier(
  task: TaskForRanking,
  now: Date,
  danger: boolean
): UrgencyTier {
  if (danger) {
    return "DANGER";
  }
  const h = hoursUntilDueDate(task, now);
  if (h == null) {
    return "NONE";
  }
  if (h < 0) {
    return "DANGER";
  }
  if (h <= 24) {
    return "HIGH";
  }
  if (h <= 24 * 7) {
    return "NORMAL";
  }
  return "LOW";
}

/**
 * Normalizes the combined impact signal (grade impact ∪ goal impact) across the
 * candidate pool so grade-driven and goal-driven tasks compete on one 0–1 scale.
 */
function normalizeImpactPool(
  tasks: TaskForRanking[],
  now: Date
): Map<string, number> {
  const raw = tasks.map((t) => rawImpact(t, now));
  const maxImpact = Math.max(...raw, 1e-9);
  const map = new Map<string, number>();
  for (const t of tasks) {
    map.set(t.id, rawImpact(t, now) / maxImpact);
  }
  return map;
}

function nominalSlotMinutes(slotMinutes: number | null): number {
  if (slotMinutes == null || !Number.isFinite(slotMinutes)) {
    return 240;
  }
  if (slotMinutes === Number.POSITIVE_INFINITY || slotMinutes <= 0) {
    return 240;
  }
  return slotMinutes;
}

/**
 * Personal / manual tasks deprioritized when any Canvas task is DANGER or HIGH (filler lane).
 */
export function isPersonalFillerCandidate(task: TaskForRanking): boolean {
  if (task.priority === "high") {
    return false;
  }
  // Erwin v2.2: goal-linked tasks carry their own impact signal and compete in
  // the main pool — they are never demoted to the personal filler lane.
  if (task.goalImportanceScore != null) {
    return false;
  }
  return task.source !== "CANVAS";
}

export function canvasHasDangerOrHigh(
  candidates: TaskForRanking[],
  now: Date
): boolean {
  return candidates.some((t) => {
    if (t.source !== "CANVAS") {
      return false;
    }
    const danger = isDangerResolved(t, now);
    const tier = computeUrgencyTier(t, now, danger);
    return tier === "DANGER" || tier === "HIGH";
  });
}

export interface Stage1Scores {
  baseScore: number;
  urgencyTier: UrgencyTier;
  danger: boolean;
  fillerDemoted: boolean;
}

export function computeStage1Scores(
  task: TaskForRanking,
  candidates: TaskForRanking[],
  now: Date,
  slotMinutes: number | null,
  normImpact: Map<string, number>
): Stage1Scores {
  const danger = isDangerResolved(task, now);
  const urgencyTier = computeUrgencyTier(task, now, danger);
  const demote =
    canvasHasDangerOrHigh(candidates, now) &&
    isPersonalFillerCandidate(task);

  // Impact term (weight 0.35) is the pool-normalized max of grade impact and
  // goal impact — a personal goal is a first-class reason to work on a task, so
  // it competes in the main pool alongside grade-driven Canvas work rather than
  // in the filler lane. Deadline (0.45) and effort (0.2) weights are unchanged.
  const ni = normImpact.get(task.id) ?? 0;
  const dp = deadlinePressure(task, now);
  const slot = nominalSlotMinutes(slotMinutes);
  const ef = effortFit(task.duration ?? 30, slot);
  let base =
    W_IMPACT * ni + W_DEADLINE * dp + W_EFFORT * ef;
  base += visibilityBoost(task, candidates, now);
  base = Math.min(2, Math.max(0, base));

  return {
    baseScore: base,
    urgencyTier,
    danger,
    fillerDemoted: demote,
  };
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

export interface OrderStage1Options {
  slotMinutes: number | null;
}

/**
 * Ordering: filler demotion when Canvas is urgent, then DANGER, then base score, then due, title.
 */
export function orderTasksStage1(
  tasks: TaskForRanking[],
  now: Date,
  options: OrderStage1Options
): TaskForRanking[] {
  const { slotMinutes } = options;
  if (tasks.length === 0) {
    return [];
  }
  const normImpact = normalizeImpactPool(tasks, now);

  const scored = tasks.map((t) => ({
    task: t,
    ...computeStage1Scores(t, tasks, now, slotMinutes, normImpact),
  }));

  scored.sort((a, b) => {
    const da = a.fillerDemoted ? 1 : 0;
    const db = b.fillerDemoted ? 1 : 0;
    if (da !== db) {
      return da - db;
    }
    const dangerA = a.danger ? 1 : 0;
    const dangerB = b.danger ? 1 : 0;
    if (dangerB !== dangerA) {
      return dangerB - dangerA;
    }
    if (b.baseScore !== a.baseScore) {
      return b.baseScore - a.baseScore;
    }
    const dta = a.task.dueDate
      ? new Date(a.task.dueDate).getTime()
      : Number.POSITIVE_INFINITY;
    const dtb = b.task.dueDate
      ? new Date(b.task.dueDate).getTime()
      : Number.POSITIVE_INFINITY;
    if (dta !== dtb) {
      return dta - dtb;
    }
    return a.task.title.localeCompare(b.task.title);
  });

  return scored.map((s) => s.task);
}

/**
 * Returns the single top task for Focus Mode (Stage 1 only).
 */
export function pickTopTaskStage1(
  tasks: TaskForRanking[],
  now: Date,
  options: OrderStage1Options
): TaskForRanking | null {
  const filtered = filterTasksForRanking(tasks, now);
  const candidates = orderTasksStage1(filtered, now, options);
  return candidates[0] ?? null;
}

/**
 * Stage 1 scores for each ordered task (same candidate pool as ranking).
 */
export function stage1MetaForTasks(
  ordered: TaskForRanking[],
  pool: TaskForRanking[],
  now: Date,
  slotMinutes: number | null
): Map<string, Stage1Scores> {
  const normImpact = normalizeImpactPool(pool, now);
  const out = new Map<string, Stage1Scores>();
  for (const t of ordered) {
    out.set(
      t.id,
      computeStage1Scores(t, pool, now, slotMinutes, normImpact)
    );
  }
  return out;
}
