/** Client shapes for GET /api/erwin/grades (src/lib/erwin/gradebook.ts). */

import type { RubricCriterion } from "@/types/course-materials";

export type SubmissionState =
  | "unsubmitted"
  | "missing"
  | "missed"
  | "ended"
  | "submitted"
  | "pending_review"
  | "graded"
  | "excused";

export interface GradeComment {
  id: string;
  author: string | null;
  body: string;
  createdAt: string | null;
  mine: boolean;
}

export interface RubricMark {
  points?: number | null;
  rating_id?: string | null;
  comments?: string | null;
}

export interface ScoreStatistics {
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  lower_q?: number;
  upper_q?: number;
}

/** A correction sync laid over Canvas for this assignment: Canvas said `canvas`, Erwin uses `value`. */
export interface AppliedCorrection {
  id: string;
  field: string;
  canvas: string | null;
  value: string | null;
  reason: string;
}

export interface GradebookAssignment {
  id: string;
  canvasId: string;
  name: string;
  groupId: string | null;
  position: number | null;
  dueAt: string | null;
  unlockAt: string | null;
  lockAt: string | null;
  pointsPossible: number | null;
  gradingType: string | null;
  submissionTypes: string[];
  omitFromFinalGrade: boolean;
  htmlUrl: string | null;
  state: SubmissionState;
  submittedAt: string | null;
  attempt: number | null;
  late: boolean;
  secondsLate: number | null;
  pointsDeducted: number | null;
  score: number | null;
  grade: string | null;
  gradedAt: string | null;
  postedAt: string | null;
  scoreStatistics: ScoreStatistics | null;
  comments: GradeComment[];
  rubricAssessment: Record<string, RubricMark> | null;
  /** Rubric criteria, from the task, to read `rubricAssessment` against. */
  rubric: RubricCriterion[] | null;
  quiz: {
    timeLimit: number | null;
    allowedAttempts: number | null;
    questionCount: number | null;
    lockdownBrowser: boolean;
  } | null;
  task: { id: string; status: string } | null;
  /** Where Erwin overrides Canvas for this assignment; null when Canvas stands. */
  corrections: AppliedCorrection[] | null;
  /** An unseen grade, feedback or missing notice points here. */
  unseen: boolean;
}

export interface GradebookGroupRow {
  id: string;
  name: string;
  position: number;
  weight: number | null;
  dropLowest: number;
  dropHighest: number;
  earned: number;
  possible: number;
  /** null until something in the group is graded. */
  percent: number | null;
}

export interface GradebookCourse {
  id: string;
  canvasId: string;
  code: string | null;
  name: string;
  /** Canvas's own numbers; null when the course hides totals. */
  currentScore: number | null;
  currentGrade: string | null;
  finalScore: number | null;
  finalGrade: string | null;
  applyGroupWeights: boolean;
  /** Erwin's own current percentage from the same rows — the stand-in when Canvas hides the total. */
  estimate: number | null;
  /** Letter for `estimate`, on the course's scheme when it has one. */
  estimateLetter: string | null;
  /** Points not graded yet that still count. */
  remainingPoints: number;
  /** What each letter takes on the remaining work, best letter first. */
  outlook: Array<{ letter: string; cutoff: number; needed: number | null; status: "secured" | "reachable" | "out_of_reach" }>;
  groups: GradebookGroupRow[];
  assignments: GradebookAssignment[];
}
