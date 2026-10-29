import { create } from "zustand";

import { invalidateResources } from "@/hooks/use-resource";
import type { ActivityFeed, ActivityItem } from "@/types/course-activity";

import { useCourseLibraryStore } from "@/store/courseLibrary";

/**
 * Canvas activity: the feed behind the Courses page's Activity view and the
 * unseen count the top bar carries on every route. Marking something seen
 * updates the feed at once, then refreshes the counts the server keeps.
 */

export type SeenTarget =
  | { ids: string[] }
  | { all: true; courseId?: string }
  | { materialId?: string; announcementId?: string; conversationId?: string; assignmentId?: string };

interface CourseActivityState {
  items: ActivityItem[];
  unseenCount: number;
  loaded: boolean;
  error: string | null;
  fetchedAt: number | null;
  /** Throttled to once a minute unless forced; navigation calls it freely. */
  load: (opts?: { force?: boolean }) => Promise<void>;
  markSeen: (target: SeenTarget) => Promise<void>;
}

const FRESH_MS = 60_000;
const FEED_LIMIT = 300;

function matches(item: ActivityItem, target: SeenTarget): boolean {
  if ("ids" in target) return target.ids.includes(item.id);
  if ("all" in target) return !target.courseId || item.course.id === target.courseId;
  return (
    (target.materialId != null && item.target.materialId === target.materialId) ||
    (target.announcementId != null && item.target.announcementId === target.announcementId) ||
    (target.conversationId != null && item.target.conversationId === target.conversationId) ||
    (target.assignmentId != null && item.target.assignmentId === target.assignmentId)
  );
}

export const useCourseActivityStore = create<CourseActivityState>()((set, get) => ({
  items: [],
  unseenCount: 0,
  loaded: false,
  error: null,
  fetchedAt: null,

  load: async ({ force = false } = {}) => {
    const { fetchedAt } = get();
    if (!force && fetchedAt != null && Date.now() - fetchedAt < FRESH_MS) return;
    set({ fetchedAt: Date.now() });
    try {
      const res = await fetch(`/api/sigwald/activity?limit=${FEED_LIMIT}`);
      if (!res.ok) throw new Error(`Failed to load activity (${res.status})`);
      const feed = (await res.json()) as ActivityFeed;
      set({ items: feed.items, unseenCount: feed.unseenCount, loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: e instanceof Error ? e.message : "Failed to load activity" });
    }
  },

  markSeen: async (target) => {
    const now = new Date().toISOString();
    const hits = get().items.filter((i) => !i.seenAt && matches(i, target));
    if (hits.length === 0 && "ids" in target) return;
    set((s) => ({
      items: s.items.map((i) => (!i.seenAt && matches(i, target) ? { ...i, seenAt: now } : i)),
      unseenCount: "all" in target && !target.courseId ? 0 : Math.max(0, s.unseenCount - hits.length),
    }));
    try {
      await fetch("/api/sigwald/activity/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
    } finally {
      // Per-course counts, unseen flags on materials, grades and news.
      invalidateResources("/api/sigwald/grades");
      invalidateResources("/api/sigwald/courses/");
      void get().load({ force: true });
      void useCourseLibraryStore.getState().fetchCourses();
    }
  },
}));
