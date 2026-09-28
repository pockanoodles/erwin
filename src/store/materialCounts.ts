import { create } from "zustand";

/**
 * How many Canvas materials each task has, for the Tasks sheet's Mat column.
 * Fetched beside the task list, not inside it: task edits replace task
 * objects wholesale, and materials only change when Canvas syncs.
 */

export interface MaterialCount {
  total: number;
  /** Linked from the assignment's own instructions. */
  cited: number;
}

interface MaterialCountsState {
  counts: Record<string, MaterialCount>;
  fetchCounts: () => Promise<void>;
}

export const useMaterialCountsStore = create<MaterialCountsState>()((set) => ({
  counts: {},
  fetchCounts: async () => {
    try {
      const res = await fetch("/api/erwin/tasks/material-counts");
      if (res.ok) set({ counts: (await res.json()) as Record<string, MaterialCount> });
    } catch {
      // Cosmetic column; an empty one is the right failure.
    }
  },
}));
