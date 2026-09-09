import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ssrSafeJsonStorage } from "@/lib/storage/ssr-safe-json-storage";

type GoalsViewMode = "list" | "map";

interface GoalsPageSettings {
  viewMode: GoalsViewMode;
  setViewMode: (mode: GoalsViewMode) => void;
}

/**
 * List/Map choice for the Bosses page. It was `useState` inside the page, which
 * was fine until the switcher moved up into the top bar — the bar renders
 * outside the page, so the two need a shared home. Persisted to match the
 * tasks page's equivalent (store/taskPageSettings.ts).
 */
export const useGoalsPageSettings = create<GoalsPageSettings>()(
  persist(
    (set) => ({
      viewMode: "list",
      setViewMode: (viewMode) => set({ viewMode }),
    }),
    {
      name: "goals-page-settings",
      storage: ssrSafeJsonStorage,
    }
  )
);
