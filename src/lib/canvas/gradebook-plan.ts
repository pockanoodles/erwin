/**
 * Pure planning for the Canvas gradebook mirror: this student's submission
 * state, which assignments become tasks, what a gradebook row stores, and what
 * changed since the last sync. No IO — `sync-canvas-gradebook.ts` reads Canvas
 * and writes.
 */
import {
  type ActivityDraft,
  excerpt,
  formatScore,
  formatWhen,
  oneLine,
} from "@/lib/canvas/activity-plan";
import type {
  CanvasAssignment,
  CanvasQuiz,
  CanvasRubricCriterion,
  CanvasRubricMark,
  CanvasScoreStatistics,
  CanvasSubmission,
} from "@/lib/canvas/types";

/**
 * unsubmitted · missing (past due, Canvas still takes it) · missed (closed,
 * never handed in) · ended (nothing to hand in through Canvas, and the date
 * has passed: a simulation round, an in-class quiz) · submitted ·
 * pending_review (handed in, a grader still has to read it) · graded · excused
 */
export const SUBMISSION_STATES = [
  "unsubmitted",
  "missing",
  "missed",
  "ended",
  "submitted",
  "pending_review",
  "graded",
  "excused",
] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

/** Handing in or being excused completes the task. */
export const DONE_STATES: ReadonlySet<string> = new Set([
  "submitted",
  "pending_review",
  "graded",
  "excused",
]);

/** Nothing left to do. `missed` and `ended` close the work without completing it. */
export const CLOSED_STATES: ReadonlySet<string> = new Set([...DONE_STATES, "missed", "ended"]);

/** Submission types that mean there's nothing to hand in through Canvas. */
const NO_SUBMISSION_TYPES = new Set(["none", "on_paper", "not_graded", "wiki_page"]);

export function isSubmittable(types: string[] | null | undefined): boolean {
  return (types ?? []).some((t) => !NO_SUBMISSION_TYPES.has(t));
}

export function submissionState(a: CanvasAssignment, now: Date): SubmissionState {
  const s = a.submission;
  if (s?.excused) {
    return "excused";
  }
  switch (s?.workflow_state) {
    case "graded":
      return "graded";
    case "pending_review":
      return "pending_review";
    case "submitted":
      return "submitted";
  }
  if (s?.submitted_at) {
    return "submitted";
  }
  const closed = a.lock_at != null && new Date(a.lock_at).getTime() <= now.getTime();
  if (s?.missing) {
    return closed ? "missed" : "missing";
  }
  if (closed && isSubmittable(a.submission_types)) {
    return "missed";
  }
  // Canvas never sees this work (it happens in class or in another tool),
  // so once its date passes there is nothing left to do here.
  if (!isSubmittable(a.submission_types) && a.due_at && new Date(a.due_at).getTime() <= now.getTime()) {
    return "ended";
  }
  return "unsubmitted";
}

/**
 * Whether an assignment becomes a task. Every assignment is in the gradebook;
 * a task is for work with something to hand in or a date to meet.
 */
export function isActionable(a: CanvasAssignment): boolean {
  const points = a.points_possible ?? 0;
  // Posted-grade placeholders ("Final Course Grade (letter)") and optional surveys.
  if (a.omit_from_final_grade && points === 0) {
    return false;
  }
  // Undated participation lines and grade adjustments: nothing to do, nothing to meet.
  if (!a.due_at && (!isSubmittable(a.submission_types) || points === 0)) {
    return false;
  }
  return true;
}

export interface PlannedComment {
  id: string;
  author: string | null;
  body: string;
  createdAt: string | null;
  /** Written by this student, so never feedback. */
  mine: boolean;
}

export interface PlannedAssignment {
  canvasId: string;
  name: string;
  position: number | null;
  dueAt: Date | null;
  unlockAt: Date | null;
  lockAt: Date | null;
  pointsPossible: number | null;
  gradingType: string | null;
  submissionTypes: string[];
  omitFromFinalGrade: boolean;
  htmlUrl: string | null;
  /** The criteria, as Canvas sends them; null when there's no rubric. */
  rubric: CanvasRubricCriterion[] | null;
  groupCanvasId: string | null;
  quizTimeLimit: number | null;
  quizAllowedAttempts: number | null;
  quizQuestionCount: number | null;
  lockdownBrowser: boolean;
  state: SubmissionState;
  submittedAt: Date | null;
  attempt: number | null;
  late: boolean;
  secondsLate: number | null;
  pointsDeducted: number | null;
  score: number | null;
  grade: string | null;
  gradedAt: Date | null;
  postedAt: Date | null;
  scoreStatistics: CanvasScoreStatistics | null;
  comments: PlannedComment[];
  rubricAssessment: Record<string, CanvasRubricMark> | null;
}

const date = (v: string | null | undefined): Date | null => (v ? new Date(v) : null);

// INTB hides its quiz list from students, but its exams say so in the title.
const LOCKDOWN_IN_TITLE = /lock\s?down|respondus/i;

/**
 * The embedded submission from the assignment list, overlaid with the richer
 * one from the submissions endpoint (comments, rubric marks) when present.
 */
export function mergeSubmission(
  embedded: CanvasSubmission | null | undefined,
  full: CanvasSubmission | undefined
): CanvasSubmission | null {
  if (!embedded && !full) {
    return null;
  }
  return { ...(embedded ?? {}), ...(full ?? {}) } as CanvasSubmission;
}

export function planAssignment(
  a: CanvasAssignment,
  quiz: CanvasQuiz | undefined,
  selfId: number | null,
  now: Date
): PlannedAssignment {
  const s = a.submission;
  const comments = (s?.submission_comments ?? [])
    .filter((c) => (c.comment ?? "").trim())
    .map((c) => ({
      id: String(c.id),
      author: c.author_name ?? null,
      body: (c.comment ?? "").trim(),
      createdAt: c.created_at ?? null,
      mine: selfId != null && c.author_id === selfId,
    }))
    .sort((x, y) => (x.createdAt ?? "").localeCompare(y.createdAt ?? ""));
  const stats = a.score_statistics;

  return {
    canvasId: String(a.id),
    name: a.name,
    position: a.position ?? null,
    dueAt: date(a.due_at),
    unlockAt: date(a.unlock_at),
    lockAt: date(a.lock_at),
    pointsPossible: a.points_possible ?? null,
    gradingType: a.grading_type ?? null,
    submissionTypes: a.submission_types ?? [],
    omitFromFinalGrade: Boolean(a.omit_from_final_grade),
    htmlUrl: a.html_url ?? null,
    rubric: a.rubric?.length ? a.rubric : null,
    groupCanvasId: a.assignment_group_id != null ? String(a.assignment_group_id) : null,
    quizTimeLimit: quiz?.time_limit ?? null,
    quizAllowedAttempts: quiz?.allowed_attempts ?? null,
    quizQuestionCount: quiz?.question_count ?? null,
    lockdownBrowser: Boolean(quiz?.require_lockdown_browser) || LOCKDOWN_IN_TITLE.test(a.name),
    state: submissionState(a, now),
    submittedAt: date(s?.submitted_at),
    attempt: s?.attempt ?? null,
    late: Boolean(s?.late),
    secondsLate: s?.seconds_late ?? null,
    pointsDeducted: s?.points_deducted ?? null,
    score: s?.score ?? null,
    grade: s?.grade ?? null,
    gradedAt: date(s?.graded_at),
    postedAt: date(s?.posted_at),
    scoreStatistics: stats && Object.keys(stats).length > 0 ? stats : null,
    comments,
    rubricAssessment:
      s?.rubric_assessment && Object.keys(s.rubric_assessment).length > 0
        ? s.rubric_assessment
        : null,
  };
}

/** What the last sync stored for an assignment — enough to tell what changed. */
export interface StoredAssignment {
  canvasId: string;
  dueAt: Date | null;
  state: string;
  score: number | null;
  grade: string | null;
  comments: PlannedComment[];
}

export interface ActivityContext {
  /** Whether this assignment is a task — gradebook-only rows don't announce themselves. */
  actionable: boolean;
  timeZone: string;
  /** "99.6% A", when Canvas shows the course total. */
  courseGrade: string | null;
}

const MISSING_DETAIL: Record<string, string> = {
  missing: "Past due — Canvas still takes it",
  missed: "Closed without a submission",
};

/**
 * What changed for one assignment since the last sync. `prev` is undefined the
 * first time Erwin sees it.
 */
export function assignmentActivity(
  prev: StoredAssignment | undefined,
  next: PlannedAssignment,
  ctx: ActivityContext,
  now: Date
): ActivityDraft[] {
  const drafts: ActivityDraft[] = [];
  const target = { assignment: next.canvasId };
  const when = (d: Date | null) => (d ? formatWhen(d, ctx.timeZone) : "no due date");

  if (!prev) {
    if (ctx.actionable && !DONE_STATES.has(next.state)) {
      drafts.push({
        kind: "ASSIGNMENT_NEW",
        title: next.name,
        detail: next.dueAt ? `Due ${when(next.dueAt)}` : "No due date yet",
        dedupeKey: `assignment:${next.canvasId}`,
        occurredAt: now,
        target,
      });
    }
  } else if (ctx.actionable && (prev.dueAt?.getTime() ?? null) !== (next.dueAt?.getTime() ?? null)) {
    drafts.push({
      kind: "DUE_CHANGED",
      title: next.name,
      detail: `${when(prev.dueAt)} → ${when(next.dueAt)}`,
      dedupeKey: `due:${next.canvasId}:${next.dueAt?.toISOString() ?? "none"}`,
      occurredAt: now,
      target,
    });
  }

  const scoreText = formatScore(next.score, next.pointsPossible, next.grade);
  const withCourse = (text: string) => (ctx.courseGrade ? `${text} · course ${ctx.courseGrade}` : text);
  const hadGrade = prev != null && (prev.score != null || prev.grade != null);
  if (scoreText && next.state === "graded") {
    if (!hadGrade) {
      drafts.push({
        kind: "GRADE_POSTED",
        title: next.name,
        detail: withCourse(scoreText),
        dedupeKey: gradeKey(next),
        occurredAt: next.postedAt ?? next.gradedAt ?? now,
        target,
      });
    } else if (prev.score !== next.score || prev.grade !== next.grade) {
      const before = formatScore(prev.score, next.pointsPossible, prev.grade);
      drafts.push({
        kind: "GRADE_CHANGED",
        title: next.name,
        detail: withCourse(before ? `${before} → ${scoreText}` : scoreText),
        dedupeKey: gradeKey(next),
        occurredAt: next.gradedAt ?? now,
        target,
      });
    }
  }

  const known = new Set(prev?.comments.map((c) => c.id) ?? []);
  for (const c of next.comments) {
    if (c.mine || known.has(c.id)) {
      continue;
    }
    drafts.push({
      kind: "FEEDBACK",
      title: next.name,
      detail: `${c.author ?? "Instructor"}: ${excerpt(oneLine(c.body))}`,
      dedupeKey: `comment:${c.id}`,
      occurredAt: c.createdAt ? new Date(c.createdAt) : now,
      target,
    });
  }

  const missingDetail = MISSING_DETAIL[next.state];
  if (ctx.actionable && missingDetail && prev?.state !== next.state) {
    drafts.push({
      kind: "MISSING",
      title: next.name,
      detail: missingDetail,
      dedupeKey: `missing:${next.canvasId}:${next.state}`,
      occurredAt: now,
      target,
    });
  }

  return drafts;
}

// A regrade back to an earlier score is still news, so the grading time is part of the key.
function gradeKey(next: PlannedAssignment): string {
  return `grade:${next.canvasId}:${next.score ?? next.grade}:${next.gradedAt?.toISOString() ?? ""}`;
}

/** Comments as stored in the `comments` Json column. */
export function storedComments(value: unknown): PlannedComment[] {
  return Array.isArray(value) ? (value as PlannedComment[]) : [];
}
