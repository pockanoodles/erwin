/** Shared shapes for the Ladder (goals map) and its header, mirroring
 *  GET /api/erwin/goals/overview. */

import { format } from "@/lib/date-utils";

/** Format a date-only value (boss/target dates) without timezone drift:
 *  "2026-08-31T00:00:00.000Z" must render Aug 31 everywhere, not Aug 30. */
export function formatDay(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return format(new Date(year, month - 1, day), "MMM d");
}

export interface OverviewHex {
  year: number;
  index: number;
  label: string;
}

export interface OverviewBoss {
  id: string;
  title: string;
  targetDate: string | null;
}

export interface OverviewCycle {
  id: string;
  theme: string;
  /** The hex's Build: stat keys being pushed this cycle (see lib/erwin/stats). */
  focusStats: string[];
  startDate: string;
  endDate: string;
  hex: OverviewHex;
  boss: OverviewBoss | null;
}

export interface GoalTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  urgencyTier: string | null;
}

export interface OverviewGoal {
  id: string;
  sortOrder: number;
  title: string;
  whyItMatters: string | null;
  definitionOfDone: string | null;
  status: string;
  importanceScore: number | null;
  develops: string[];
  isBoss: boolean;
  targetDate: string | null;
  /** A boss that is a Canvas assignment: that task's id (it and the boss are one row in Tasks). */
  boundTaskId: string | null;
  /** DAG: a goal can feed several parents; empty = root of the hex. */
  parentGoalIds: string[];
  tasks: GoalTask[];
}

export interface UnassignedTask {
  id: string;
  title: string;
  dueDate: string | null;
  urgencyTier: string | null;
}

export interface GoalsOverview {
  activeCycle: OverviewCycle;
  goals: OverviewGoal[];
  unassignedTasks: UnassignedTask[];
}

/** Local state updater passed down from the page — applies an optimistic
 *  change to the overview without waiting on a refetch. */
export type ApplyOverview = (fn: (o: GoalsOverview) => GoalsOverview) => void;

/** Flat goals → children-by-parent lookup; roots (no parents) under `null`.
 *  A multi-parent goal appears under each of its parents. */
export function goalChildren(
  goals: OverviewGoal[]
): Map<string | null, OverviewGoal[]> {
  const byParent = new Map<string | null, OverviewGoal[]>();
  const push = (key: string | null, goal: OverviewGoal) => {
    const list = byParent.get(key) ?? [];
    list.push(goal);
    byParent.set(key, list);
  };
  for (const goal of goals) {
    if (goal.parentGoalIds.length === 0) {
      push(null, goal);
    } else {
      for (const parentId of goal.parentGoalIds) {
        push(parentId, goal);
      }
    }
  }
  return byParent;
}

/** The hex's boss: nearest-dated active boss goal, undated bosses last —
 *  the same "next boss" rule as the ops HUD. */
export function hexBoss(goals: OverviewGoal[]): OverviewGoal | null {
  return (
    goals
      .filter((goal) => goal.isBoss && goal.status === "active")
      .sort((a, b) => {
        if (!a.targetDate) return b.targetDate ? 1 : 0;
        if (!b.targetDate) return -1;
        return (
          new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
        );
      })[0] ?? null
  );
}
