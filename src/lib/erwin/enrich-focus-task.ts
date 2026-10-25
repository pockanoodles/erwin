/**
 * Queue response display fields (docs/focus-mode.md §2.8): Focus's own words
 * about a task. What a module knows about it (Courses: the grade) arrives as
 * task facts instead.
 */

import { humanCountdown } from "@/lib/erwin/human-countdown";
import type { FocusQueueTaskRow } from "@/lib/erwin/focus-queue-core";

export interface ErwinQueueAugmentation {
  countdownHuman: string | null;
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

export function enrichFocusTaskDisplay(
  task: Pick<FocusQueueTaskRow, "dueDate" | "lastSkippedAt" | "duration">,
  now: Date
): ErwinQueueAugmentation {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  return {
    countdownHuman: due ? humanCountdown(due, now) : null,
    lastSkippedAgo: formatLastSkippedAgo(task.lastSkippedAt, now),
    effortEstimate: formatEffortMinutes(task.duration),
  };
}
