import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ssrSafeJsonStorage } from "@/lib/storage/ssr-safe-json-storage";

/**
 * Lords = the active hex's root goals. Each Lord's section on the tasks page
 * covers its whole path — every boss (subgoal) reachable beneath it in the
 * goal DAG — so a task fighting for any boss on the way counts for the Lord.
 */

export const UNASSIGNED_LORD_ID = "unassigned";

export interface Lord {
  id: string;
  title: string;
  isBoss: boolean;
  /** The Lord plus every goal in its subtree. */
  goalIds: string[];
}

interface OverviewGoal {
  id: string;
  title: string;
  isBoss: boolean;
  parentGoalIds: string[];
}

function subtreeOf(rootId: string, childrenOf: Map<string, string[]>): string[] {
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

export function lordsFromGoals(goals: OverviewGoal[]): Lord[] {
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
      isBoss: goal.isBoss,
      goalIds: subtreeOf(goal.id, childrenOf),
    }));
}

/** The tasks-page section filter: null = all tasks, UNASSIGNED_LORD_ID =
 *  tasks serving no goal, otherwise tasks linked anywhere in the Lord's path. */
export function filterTasksByLord<
  T extends { goalLinks?: { goalId: string }[] },
>(tasks: T[], lords: Lord[], activeLordId: string | null): T[] {
  if (!activeLordId) return tasks;
  if (activeLordId === UNASSIGNED_LORD_ID) {
    return tasks.filter((task) => !task.goalLinks?.length);
  }
  const lord = lords.find((l) => l.id === activeLordId);
  if (!lord) return tasks;
  const goalIds = new Set(lord.goalIds);
  return tasks.filter((task) =>
    task.goalLinks?.some((link) => goalIds.has(link.goalId))
  );
}

interface LordStore {
  lords: Lord[];
  activeLordId: string | null;
  fetchLords: () => Promise<void>;
  setActiveLordId: (id: string | null) => void;
}

export const useLordStore = create<LordStore>()(
  persist(
    (set) => ({
      lords: [],
      activeLordId: null,

      fetchLords: async () => {
        try {
          const res = await fetch("/api/erwin/goals/overview");
          if (!res.ok) return;
          const json: { goals: OverviewGoal[] } = await res.json();
          const lords = lordsFromGoals(json.goals);
          set((state) => ({
            lords,
            // A persisted selection pointing at a deleted Lord silently
            // filters everything out — drop it.
            activeLordId:
              state.activeLordId === UNASSIGNED_LORD_ID ||
              lords.some((l) => l.id === state.activeLordId)
                ? state.activeLordId
                : null,
          }));
        } catch {
          // Sidebar is a convenience view; a failed fetch just leaves it empty.
        }
      },

      setActiveLordId: (id: string | null) => {
        set({ activeLordId: id });
      },
    }),
    {
      name: "lord-store",
      storage: ssrSafeJsonStorage,
      partialize: (state) => ({
        activeLordId: state.activeLordId,
      }),
    }
  )
);
