import { create } from "zustand";

import { invalidateResources } from "@/hooks/use-resource";
import type { LibraryCourse } from "@/types/course-materials";

import { useMaterialCountsStore } from "@/store/materialCounts";

/**
 * The /courses library tree, plus the hand-pressed Canvas sync that refills
 * it. Shared by the page and its top-bar action, which live apart.
 */
interface CourseLibraryState {
  courses: LibraryCourse[];
  loaded: boolean;
  error: string | null;
  syncing: boolean;
  lastSyncError: string | null;
  fetchCourses: () => Promise<void>;
  /** Re-mirror every course now. Unchanged files aren't re-downloaded, but it still takes minutes. */
  sync: () => Promise<void>;
}

export const useCourseLibraryStore = create<CourseLibraryState>()((set, get) => ({
  courses: [],
  loaded: false,
  error: null,
  syncing: false,
  lastSyncError: null,

  fetchCourses: async () => {
    try {
      const res = await fetch("/api/erwin/courses");
      if (!res.ok) throw new Error(`Failed to load courses (${res.status})`);
      set({ courses: (await res.json()) as LibraryCourse[], loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: e instanceof Error ? e.message : "Failed to load courses" });
    }
  },

  sync: async () => {
    if (get().syncing) return;
    set({ syncing: true, lastSyncError: null });
    try {
      const res = await fetch("/api/erwin/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Sync failed (${res.status})`);
      }
      // Bodies, packets and counts may all have moved.
      invalidateResources("/api/erwin/");
      await Promise.all([get().fetchCourses(), useMaterialCountsStore.getState().fetchCounts()]);
    } catch (e) {
      set({ lastSyncError: e instanceof Error ? e.message : "Sync failed" });
    } finally {
      set({ syncing: false });
    }
  },
}));
