/**
 * Maps API JSON (ISO date strings) to client `Task` shape for Focus UI.
 */

import type { Project } from "@/types/project";
import type { Tag, Task } from "@/types/task";
import { TaskStatus } from "@/types/task";

type ApiTask = Record<string, unknown>;

/** Task row from `/api/erwin/focus/queue` (client-only `erwin` flags). */
export type FocusQueueTask = Task & {
  erwin?: {
    danger?: boolean;
    urgencyTier?: string;
    baseScore?: number;
    countdownHuman?: string | null;
    gradeImpactPercent?: number | null;
    gradeProjection?: {
      currentGrade: number;
      gradeIfMissed: number;
      letterCurrent: string;
      letterIfMissed: string;
    } | null;
    lastSkippedAgo?: string | null;
    effortEstimate?: string;
  };
};

function parseDate(v: unknown): Date | null {
  if (v == null || v === "") {
    return null;
  }
  if (v instanceof Date) {
    return v;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Normalizes a task row returned from `/api/erwin/focus/queue` or `/api/tasks`.
 */
export function parseTaskFromApi(raw: ApiTask): FocusQueueTask {
  const tags = (raw.tags as Tag[] | undefined) ?? [];
  const project = (raw.project as Project | null | undefined) ?? null;

  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    description: (raw.description as string | null | undefined) ?? null,
    status: (raw.status as TaskStatus) ?? TaskStatus.TODO,
    dueDate: parseDate(raw.dueDate),
    startDate: parseDate(raw.startDate),
    duration: (raw.duration as number | null | undefined) ?? null,
    priority: raw.priority as Task["priority"],
    energyLevel: raw.energyLevel as Task["energyLevel"],
    preferredTime: raw.preferredTime as Task["preferredTime"],
    tags,
    projectId: (raw.projectId as string | null | undefined) ?? null,
    project,
    createdAt: parseDate(raw.createdAt) ?? new Date(),
    updatedAt: parseDate(raw.updatedAt) ?? new Date(),
    recurrenceRule: (raw.recurrenceRule as string | null | undefined) ?? null,
    lastCompletedDate: parseDate(raw.lastCompletedDate),
    completedAt: parseDate(raw.completedAt),
    isRecurring: Boolean(raw.isRecurring),
    isAutoScheduled: Boolean(raw.isAutoScheduled),
    scheduledStart: parseDate(raw.scheduledStart),
    scheduledEnd: parseDate(raw.scheduledEnd),
    scheduleScore: (raw.scheduleScore as number | null | undefined) ?? null,
    lastScheduled: parseDate(raw.lastScheduled),
    scheduleLocked: Boolean(raw.scheduleLocked),
    postponedUntil: parseDate(raw.postponedUntil),
    externalTaskId: (raw.externalTaskId as string | null | undefined) ?? null,
    source: (raw.source as string | null | undefined) ?? null,
    externalListId: (raw.externalListId as string | null | undefined) ?? null,
    lastSyncedAt: parseDate(raw.lastSyncedAt),
    lockAt: parseDate(raw.lockAt),
    unlockAt: parseDate(raw.unlockAt),
    courseName: (raw.courseName as string | null | undefined) ?? null,
    courseId: (raw.courseId as string | null | undefined) ?? null,
    gradeImpactScore: (raw.gradeImpactScore as number | null | undefined) ?? null,
    gradeWeightPercent:
      raw.gradeWeightPercent == null
        ? undefined
        : Number(raw.gradeWeightPercent),
    skipCount:
      raw.skipCount == null ? undefined : Number(raw.skipCount),
    lastSkippedAt: parseDate(raw.lastSkippedAt),
    submissionStatus: (raw.submissionStatus as string | null | undefined) ?? null,
    externalUrl: (raw.externalUrl as string | null | undefined) ?? null,
    category: (raw.category as string | null | undefined) ?? null,
    erwin: raw.erwin as FocusQueueTask["erwin"],
  };
}
