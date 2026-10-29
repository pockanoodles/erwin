/**
 * GET /api/sigwald/focus/briefing response (docs/focus-mode.md §1.2). Each task
 * carries the facts its module adds (Courses: course, grade share, and in
 * danger the grade if it's missed).
 */

import type { CourseTaskFacts } from "@/types/task";

export interface RankedTaskBrief extends CourseTaskFacts {
  id: string;
  title: string;
  category: string;
  dueAt: string | null;
  countdownHuman: string | null;
  estimatedDuration: number;
  urgencyTier: "DANGER" | "HIGH" | "NORMAL" | "LOW" | "NONE";
  baseScore: number;
}

export interface DangerTaskBrief extends CourseTaskFacts {
  id: string;
  title: string;
  dueAt: string;
  countdownHuman: string;
  skipCount: number;
}

export interface BriefingData {
  date: string;
  tasksDueToday: number;
  tasksDueThisWeek: number;
  dangerZoneTasks: DangerTaskBrief[];
  totalPendingTasks: number;
  freeHoursToday: number | null;
  nextEvent: { title: string; startsIn: string } | null;
  topTasks: RankedTaskBrief[];
  tasksCompletedToday: number;
  tasksCompletedThisWeek: number;
  avgTasksPerDay: number;
}
