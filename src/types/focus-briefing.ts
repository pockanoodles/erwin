/**
 * GET /api/erwin/focus/briefing response (docs/focus-mode.md §1.2).
 */

export interface RankedTaskBrief {
  id: string;
  title: string;
  courseName: string | null;
  category: string;
  dueAt: string | null;
  countdownHuman: string | null;
  estimatedDuration: number;
  gradeImpactPercent: number | null;
  urgencyTier: "DANGER" | "HIGH" | "NORMAL" | "LOW" | "NONE";
  baseScore: number;
}

export interface DangerTaskBrief {
  id: string;
  title: string;
  courseName: string | null;
  dueAt: string;
  countdownHuman: string;
  gradeImpactPercent: number;
  skipCount: number;
}

export interface GradeProjectionBrief {
  taskId: string;
  taskTitle: string;
  courseName: string;
  currentCourseGrade: number;
  gradeIfMissed: number;
  letterGradeCurrent: string;
  letterGradeIfMissed: string;
}

export interface BriefingData {
  date: string;
  tasksDueToday: number;
  tasksDueThisWeek: number;
  dangerZoneTasks: DangerTaskBrief[];
  totalPendingTasks: number;
  freeHoursToday: number | null;
  nextEvent: { title: string; startsIn: string } | null;
  dangerProjections: GradeProjectionBrief[];
  topTasks: RankedTaskBrief[];
  tasksCompletedToday: number;
  tasksCompletedThisWeek: number;
  avgTasksPerDay: number;
}
