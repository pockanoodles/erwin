/**
 * Maps API JSON (ISO date strings) to client `Task` shape for Focus UI.
 */

import type { Project } from "@/types/project";
import type { Tag, Task } from "@/types/task";
import { TaskStatus } from "@/types/task";

type ApiTask = Record<string, unknown>;

/** A goal a task ladders up to (from TaskGoalLink → Goal), surfaced for the
 *  command dashboard. Dates stay ISO strings — render via `formatDay`. */
export interface LadderGoal {
  id: string;
  title: string;
  isBoss: boolean;
  targetDate: string | null;
  externalId: string | null;
  importanceScore: number | null;
  develops: string[];
  whyItMatters: string | null;
}

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
  /** Goals this task climbs toward. The queue join (`goalLinks[].goal`) is
   *  mapped here; the base `Task.goalLinks` only carries ids. */
  ladderGoals?: LadderGoal[];
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

  const ladderGoals: LadderGoal[] = Array.isArray(raw.goalLinks)
    ? (raw.goalLinks as Array<{ goal?: Record<string, unknown> }>)
        .map((link) => link.goal)
        .filter((g): g is Record<string, unknown> => Boolean(g))
        .map((g) => ({
          id: String(g.id),
          title: String(g.title ?? ""),
          isBoss: Boolean(g.isBoss),
          targetDate: (g.targetDate as string | null) ?? null,
          externalId: (g.externalId as string | null) ?? null,
          importanceScore:
            g.importanceScore == null ? null : Number(g.importanceScore),
          develops: Array.isArray(g.develops) ? (g.develops as string[]) : [],
          whyItMatters: (g.whyItMatters as string | null) ?? null,
        }))
    : [];

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
    ladderGoals,
  };
}

/** The goal a task most represents climbing toward: a boss outranks a Lord,
 *  then higher importance. Null when the task links to no goal yet. */
export function primaryLadderGoal(task: FocusQueueTask): LadderGoal | null {
  const goals = task.ladderGoals ?? [];
  if (goals.length === 0) {
    return null;
  }
  return [...goals].sort((a, b) => {
    if (a.isBoss !== b.isBoss) {
      return a.isBoss ? -1 : 1;
    }
    return (b.importanceScore ?? 0) - (a.importanceScore ?? 0);
  })[0];
}
