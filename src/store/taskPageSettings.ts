import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ssrSafeJsonStorage } from "@/lib/storage/ssr-safe-json-storage";

type ViewMode = "list" | "board";

interface TaskPageSettings {
  // View settings
  viewMode: ViewMode;

  // Actions
  setViewMode: (mode: ViewMode) => void;
}

export const useTaskPageSettings = create<TaskPageSettings>()(
  persist(
    (set) => ({
      // Initial view settings
      viewMode: "list",

      // Actions
      setViewMode: (viewMode) => set({ viewMode }),
    }),
    {
      name: "task-page-settings",
      storage: ssrSafeJsonStorage,
    }
  )
);
