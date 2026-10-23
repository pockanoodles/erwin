import { create } from "zustand";

import { invalidateResources } from "@/hooks/use-resource";
import type { LibraryCourse } from "@/types/course-materials";

import { useMaterialCountsStore } from "@/store/materialCounts";

/** The Courses page's four views, switched from the top bar. */
export type CoursesView = "activity" | "grades" | "news" | "library";

/** The sheet tab for every course at once. */
export const ALL_COURSES = "all";

/**
 * The /courses tree, which view and sheet tab are showing, plus the
 * hand-pressed Canvas sync that refills it. Shared by the page and its
 * top-bar views and action, which live apart.
 */
interface CourseLibraryState {
  courses: LibraryCourse[];
  loaded: boolean;
  error: string | null;
  syncing: boolean;
  lastSyncError: string | null;
  /** The background sync's own record: when it last finished and why it last failed. */
  canvasSync: { lastSyncedAt: string | null; error: string | null } | null;
  view: CoursesView;
  /** A course id, or ALL_COURSES. */
  courseKey: string;
  setView: (view: CoursesView) => void;
  setCourseKey: (key: string) => void;
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
  canvasSync: null,
  view: "activity",
  courseKey: ALL_COURSES,

  setView: (view) => set({ view }),
  setCourseKey: (courseKey) => set({ courseKey }),

  fetchCourses: async () => {
    try {
      const [res, status] = await Promise.all([fetch("/api/erwin/courses"), fetch("/api/erwin/canvas")]);
      if (!res.ok) throw new Error(`Failed to load courses (${res.status})`);
      const provider = status.ok
        ? ((await status.json()) as { provider: { lastSyncedAt: string | null; error: string | null } | null }).provider
        : null;
      set({
        courses: (await res.json()) as LibraryCourse[],
        canvasSync: provider ? { lastSyncedAt: provider.lastSyncedAt, error: provider.error } : null,
        loaded: true,
        error: null,
      });
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
