/**
 * Queue response display fields (docs/focus-mode.md §2.8).
 */

import type { GradeProjectionResult } from "@/lib/erwin/grade-projection";
import { humanCountdown } from "@/lib/erwin/human-countdown";
import type { FocusQueueTaskRow } from "@/lib/erwin/focus-queue-core";

export interface ErwinQueueAugmentation {
  countdownHuman: string | null;
  gradeImpactPercent: number | null;
  gradeProjection: {
    currentGrade: number;
    gradeIfMissed: number;
    letterCurrent: string;
    letterIfMissed: string;
  } | null;
  lastSkippedAgo: string | null;
  effortEstimate: string;
}

function formatEffortMinutes(minutes: number | null | undefined): string {
  const m = minutes ?? 30;
  if (m >= 180) {
    return `~${m / 60}h`;
  }
  if (m >= 120) {
    return "~2h";
  }
  if (m >= 60) {
    return "~1h";
  }
  return `~${m} min`;
}

function formatLastSkippedAgo(
  lastSkippedAt: Date | null,
  now: Date
): string | null {
  if (!lastSkippedAt) {
    return null;
  }
  const ms = now.getTime() - lastSkippedAt.getTime();
  if (ms < 60_000) {
    return "just now";
  }
  const m = Math.floor(ms / 60_000);
  if (m < 60) {
    return `${m}m ago`;
  }
  const h = Math.floor(m / 60);
  if (h < 48) {
    return `${h}h ago`;
  }
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Maps Canvas grade projection to API shape for `erwin.gradeProjection`.
 */
export function mapGradeProjection(
  p: GradeProjectionResult | null,
  options: { danger: boolean; source: string | null }
): ErwinQueueAugmentation["gradeProjection"] {
  if (!p || options.source !== "CANVAS" || !options.danger) {
    return null;
  }
  return {
    currentGrade: p.currentCourseGrade,
    gradeIfMissed: p.gradeIfMissed,
    letterCurrent: p.letterGradeCurrent,
    letterIfMissed: p.letterGradeIfMissed,
  };
}

export function enrichFocusTaskDisplay(
  task: FocusQueueTaskRow,
  now: Date,
  gradeProjection: GradeProjectionResult | null,
  options: { danger: boolean }
): ErwinQueueAugmentation {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const countdownHuman = due ? humanCountdown(due, now) : null;

  const gradeImpactPercent =
    task.source === "CANVAS" && task.gradeWeightPercent != null
      ? Math.round(task.gradeWeightPercent * 10) / 10
      : null;

  return {
    countdownHuman,
    gradeImpactPercent,
    gradeProjection: mapGradeProjection(gradeProjection, {
      danger: options.danger,
      source: task.source,
    }),
    lastSkippedAgo: formatLastSkippedAgo(task.lastSkippedAt, now),
    effortEstimate: formatEffortMinutes(task.duration),
  };
}
