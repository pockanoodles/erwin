/**
 * Builds JSON snapshots for TaskInteraction.contextJson (Stage 2 features + analytics).
 */

export type TimeOfDayBucket = "night" | "morning" | "afternoon" | "evening";

export function timeOfDayBucket(hour: number): TimeOfDayBucket {
  if (hour < 5) {
    return "night";
  }
  if (hour < 12) {
    return "morning";
  }
  if (hour < 17) {
    return "afternoon";
  }
  if (hour < 22) {
    return "evening";
  }
  return "night";
}

export interface FocusInteractionContext {
  timeOfDay: TimeOfDayBucket;
  dayOfWeek: number;
  hour: number;
  /** Count of tasks this user completed since local-midnight UTC anchor (see API). */
  tasksCompletedToday: number;
  /** Optional client hints */
  clientTimezone?: string;
  /** ISO timestamp when the interaction was recorded */
  recordedAt: string;
}

export function buildFocusInteractionContext(params: {
  now: Date;
  tasksCompletedToday: number;
  clientTimezone?: string;
}): FocusInteractionContext {
  const { now, tasksCompletedToday, clientTimezone } = params;
  return {
    timeOfDay: timeOfDayBucket(now.getUTCHours()),
    dayOfWeek: now.getUTCDay(),
    hour: now.getUTCHours(),
    tasksCompletedToday,
    clientTimezone,
    recordedAt: now.toISOString(),
  };
}
