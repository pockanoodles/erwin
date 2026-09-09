import { create } from "zustand";

import { isToday } from "@/lib/date-utils";
import { parseTaskFromApi, type FocusQueueTask } from "@/lib/erwin/parse-task";

/**
 * How long a fetched queue is considered fresh. The top bar asks for the queue
 * on every route change so the counts follow you around the app; without this
 * that would be a request per navigation. A minute is short enough that the
 * strip is never meaningfully wrong and long enough that clicking between
 * Calendar and Tasks costs nothing.
 */
const STALE_MS = 60_000;

interface ErwinStatusStore {
  tasks: FocusQueueTask[];
  slotNarrative: string | null;
  status: "idle" | "loading" | "ready" | "error";
  fetchedAt: number | null;
  load: (opts?: { force?: boolean }) => Promise<void>;
  /** Drop a completed task locally so the counts fall immediately. */
  removeTask: (id: string) => void;
}

/**
 * The ranked Erwin queue, shared by the top bar's status strip and the Today
 * dashboard. Today used to own this as component state, so the counts could
 * only ever be shown on /today; the strip is app-wide chrome now, and two
 * independent fetches of the same endpoint would be the obvious wrong answer.
 */
export const useErwinStatusStore = create<ErwinStatusStore>((set, get) => ({
  tasks: [],
  slotNarrative: null,
  status: "idle",
  fetchedAt: null,

  load: async ({ force = false } = {}) => {
    const { status, fetchedAt } = get();
    if (status === "loading") {
      return;
    }
    if (!force && fetchedAt != null && Date.now() - fetchedAt < STALE_MS) {
      return;
    }
    // Only the very first load shows a loading state — a background refresh
    // must not blank the strip that's already on screen.
    set({ status: fetchedAt == null ? "loading" : status });
    try {
      const res = await fetch("/api/erwin/focus/queue");
      if (!res.ok) {
        set({ status: "error" });
        return;
      }
      const data = await res.json();
      set({
        tasks: (data.ranked ?? []).map(parseTaskFromApi),
        slotNarrative: data.briefing?.slotNarrative ?? null,
        status: "ready",
        fetchedAt: Date.now(),
      });
    } catch {
      set({ status: "error" });
    }
  },

  removeTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
}));

export function countDueToday(tasks: FocusQueueTask[]): number {
  return tasks.filter((t) => t.dueDate && isToday(t.dueDate)).length;
}

export function countDanger(tasks: FocusQueueTask[]): number {
  return tasks.filter(
    (t) => t.erwin?.danger || t.erwin?.urgencyTier === "DANGER"
  ).length;
}
