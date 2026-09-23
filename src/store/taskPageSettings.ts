import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ssrSafeJsonStorage } from "@/lib/storage/ssr-safe-json-storage";

type ViewMode = "list" | "board";
/** List mode rendering: Things-style rows (default) or the datasheet. */
type ListStyle = "rows" | "sheet";

interface TaskPageSettings {
  // View settings
  viewMode: ViewMode;
  listStyle: ListStyle;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setListStyle: (style: ListStyle) => void;
}

export const useTaskPageSettings = create<TaskPageSettings>()(
  persist(
    (set) => ({
      // Initial view settings
      viewMode: "list",
      listStyle: "rows",

      // Actions
      setViewMode: (viewMode) => set({ viewMode }),
      setListStyle: (listStyle) => set({ listStyle }),
    }),
    {
      name: "task-page-settings",
      storage: ssrSafeJsonStorage,
    }
  )
);
