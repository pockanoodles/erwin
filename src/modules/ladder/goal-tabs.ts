import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ssrSafeJsonStorage } from "@/lib/storage/ssr-safe-json-storage";

/**
 * The Tasks page's goal tabs (Ladder's Tasks lens): one per top goal of the
 * running cycle. A tab covers its goal's whole path, every milestone beneath
 * it in the goal DAG, so a task working toward any of them counts for the
 * top goal.
 */

/** The tab for tasks that serve no goal. */
export const NO_GOAL_TAB = "none";

export interface TopGoal {
  id: string;
  title: string;
  /** The goal and every goal beneath it. */
  goalIds: string[];
}

/** A goal as GET /api/erwin/goals/overview sends it, as far as the tabs read it. */
export interface OverviewGoal {
  id: string;
  title: string;
  parentGoalIds: string[];
}

function subtreeOf(
  rootId: string,
  childrenOf: Map<string, string[]>
): string[] {
  const seen = new Set([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const child of childrenOf.get(current) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return [...seen];
}

/** The cycle's top goals (those under no other), each with its path. */
export function topGoalsFrom(goals: OverviewGoal[]): TopGoal[] {
  const childrenOf = new Map<string, string[]>();
  for (const goal of goals) {
    for (const parentId of goal.parentGoalIds) {
      const list = childrenOf.get(parentId) ?? [];
      list.push(goal.id);
      childrenOf.set(parentId, list);
    }
  }
  return goals
    .filter((goal) => goal.parentGoalIds.length === 0)
    .map((goal) => ({
      id: goal.id,
      title: goal.title,
      goalIds: subtreeOf(goal.id, childrenOf),
    }));
}

/** The top goal a task works toward: the one whose path holds a goal it's linked to. */
export function topGoalOf<T extends { goalLinks?: { goalId: string }[] }>(
  task: T,
  topGoals: TopGoal[]
): TopGoal | undefined {
  return topGoals.find((top) =>
    task.goalLinks?.some((link) => top.goalIds.includes(link.goalId))
  );
}

/** The open tab's tasks: all of them (null), those serving no goal, or one goal's path. */
export function filterTasksByGoal<
  T extends { goalLinks?: { goalId: string }[] },
>(tasks: T[], topGoals: TopGoal[], activeId: string | null): T[] {
  if (!activeId) return tasks;
  if (activeId === NO_GOAL_TAB) {
    return tasks.filter((task) => !task.goalLinks?.length);
  }
  const top = topGoals.find((g) => g.id === activeId);
  if (!top) return tasks;
  const goalIds = new Set(top.goalIds);
  return tasks.filter((task) =>
    task.goalLinks?.some((link) => goalIds.has(link.goalId))
  );
}

interface GoalTabStore {
  topGoals: TopGoal[];
  /** The open tab: a top goal's id, NO_GOAL_TAB, or null for all tasks. */
  activeId: string | null;
  load: () => Promise<void>;
  setActiveId: (id: string | null) => void;
}

export const useGoalTabStore = create<GoalTabStore>()(
  persist(
    (set) => ({
      topGoals: [],
      activeId: null,

      load: async () => {
        try {
          const res = await fetch("/api/erwin/goals/overview");
          if (!res.ok) return;
          const json: { goals: OverviewGoal[] } = await res.json();
          const topGoals = topGoalsFrom(json.goals);
          set((state) => ({
            topGoals,
            // A remembered tab whose goal is gone would silently filter
            // everything out; drop it.
            activeId:
              state.activeId === NO_GOAL_TAB ||
              topGoals.some((g) => g.id === state.activeId)
                ? state.activeId
                : null,
          }));
        } catch {
          // The tabs are a convenience; a failed fetch leaves them as they were.
        }
      },

      setActiveId: (id) => set({ activeId: id }),
    }),
    {
      name: "goal-tab",
      storage: ssrSafeJsonStorage,
      partialize: (state) => ({ activeId: state.activeId }),
    }
  )
);
