/**
 * Canvas-weighted course grade and "if you miss this assignment" projection.
 * @see docs/focus-mode.md §1.3, docs/ERWIN-SPEC.md §5.2
 */

import type {
  CanvasAssignment,
  CanvasAssignmentGroup,
} from "@/lib/canvas/types";

export interface GradeProjectionResult {
  currentCourseGrade: number;
  gradeIfMissed: number;
  letterGradeCurrent: string;
  letterGradeIfMissed: string;
}

/**
 * US-style letter scale (spec example).
 */
export function percentToLetter(percent: number): string {
  if (percent >= 93) {
    return "A";
  }
  if (percent >= 90) {
    return "A-";
  }
  if (percent >= 87) {
    return "B+";
  }
  if (percent >= 83) {
    return "B";
  }
  if (percent >= 80) {
    return "B-";
  }
  if (percent >= 77) {
    return "C+";
  }
  if (percent >= 73) {
    return "C";
  }
  if (percent >= 70) {
    return "C-";
  }
  if (percent >= 67) {
    return "D+";
  }
  if (percent >= 63) {
    return "D";
  }
  if (percent >= 60) {
    return "D-";
  }
  return "F";
}

function groupAssignments(
  assignments: CanvasAssignment[]
): Map<number, CanvasAssignment[]> {
  const m = new Map<number, CanvasAssignment[]>();
  for (const a of assignments) {
    const gid = a.assignment_group_id ?? 0;
    if (!m.has(gid)) {
      m.set(gid, []);
    }
    m.get(gid)!.push(a);
  }
  return m;
}

/**
 * Weighted course percentage: Σ (groupPercent × group_weight / 100).
 * Group percent = earned / possible within group for graded submissions only.
 */
export function computeWeightedCoursePercent(
  assignments: CanvasAssignment[],
  groups: CanvasAssignmentGroup[],
  /** Override score for a single assignment id (e.g. pending danger → 0) */
  scoreOverride?: Map<number, number | null>
): number | null {
  const byGroup = groupAssignments(assignments);

  let weighted = 0;
  let anyContribution = false;

  for (const g of groups) {
    const wPct = g.group_weight ?? 0;
    if (wPct <= 0) {
      continue;
    }
    const list = byGroup.get(g.id) ?? [];
    let earned = 0;
    let possible = 0;
    for (const a of list) {
      const pts = a.points_possible ?? 0;
      if (pts <= 0 || a.omit_from_final_grade) {
        continue;
      }
      const override = scoreOverride?.get(a.id);
      const sub = a.submission;
      if (override !== undefined) {
        possible += pts;
        earned += override ?? 0;
        anyContribution = true;
        continue;
      }
      if (
        sub?.workflow_state === "graded" &&
        sub.score != null &&
        Number.isFinite(sub.score)
      ) {
        earned += sub.score;
        possible += pts;
        anyContribution = true;
      }
    }
    if (possible <= 0) {
      continue;
    }
    const groupPercent = (earned / possible) * 100;
    weighted += groupPercent * (wPct / 100);
  }

  if (!anyContribution && assignments.length > 0) {
    const hasGraded = assignments.some(
      (a) =>
        a.submission?.workflow_state === "graded" && a.submission.score != null
    );
    if (!hasGraded) {
      return null;
    }
  }

  return anyContribution || weighted > 0 ? weighted : null;
}

/**
 * Current weighted grade vs grade if the pending assignment were scored as 0.
 */
export function computeGradeProjectionFromCanvas(
  assignments: CanvasAssignment[],
  groups: CanvasAssignmentGroup[],
  pendingCanvasAssignmentId: number
): GradeProjectionResult | null {
  const current = computeWeightedCoursePercent(assignments, groups);
  const missedMap = new Map<number, number | null>();
  missedMap.set(pendingCanvasAssignmentId, 0);
  const projected = computeWeightedCoursePercent(
    assignments,
    groups,
    missedMap
  );

  if (current == null || projected == null) {
    return null;
  }

  return {
    currentCourseGrade: Math.round(current * 10) / 10,
    gradeIfMissed: Math.round(projected * 10) / 10,
    letterGradeCurrent: percentToLetter(current),
    letterGradeIfMissed: percentToLetter(projected),
  };
}
