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

/**
 * A boss as the Tasks sheet shows it: a milestone row under its Lord. One
 * bound to a Canvas assignment is that task's row, not a second one.
 */
export interface Boss {
  id: string;
  title: string;
  targetDate: string | null;
  /** Killed in the vault (✅), or its bound assignment is submitted. */
  felled: boolean;
  /** The Lord whose path it sits on; null if the DAG never reaches a root. */
  lordId: string | null;
  boundTaskId: string | null;
}

interface OverviewGoal {
  id: string;
  title: string;
  isBoss: boolean;
  status: string;
  targetDate: string | null;
  boundTaskId: string | null;
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

/** Every boss of the hex, nearest first (undated last), placed under a Lord. */
export function bossesFromGoals(goals: OverviewGoal[], lords: Lord[]): Boss[] {
  return goals
    .filter((goal) => goal.isBoss && goal.parentGoalIds.length > 0)
    .map((goal) => ({
      id: goal.id,
      title: goal.title,
      targetDate: goal.targetDate,
      felled: goal.status === "done",
      lordId: lords.find((lord) => lord.goalIds.includes(goal.id))?.id ?? null,
      boundTaskId: goal.boundTaskId,
    }))
    .sort((a, b) => {
      if (!a.targetDate) return b.targetDate ? 1 : 0;
      if (!b.targetDate) return -1;
      return a.targetDate.localeCompare(b.targetDate);
    });
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
  bosses: Boss[];
  activeLordId: string | null;
  fetchLords: () => Promise<void>;
  setActiveLordId: (id: string | null) => void;
}

export const useLordStore = create<LordStore>()(
  persist(
    (set) => ({
      lords: [],
      bosses: [],
      activeLordId: null,

      fetchLords: async () => {
        try {
          const res = await fetch("/api/erwin/goals/overview");
          if (!res.ok) return;
          const json: { goals: OverviewGoal[] } = await res.json();
          const lords = lordsFromGoals(json.goals);
          set((state) => ({
            lords,
            bosses: bossesFromGoals(json.goals, lords),
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
