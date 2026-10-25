import { create } from "zustand";

import type { StatKey } from "@/lib/erwin/stats";
import type { HexRef, LadderPayload } from "@/types/ladder";

/**
 * The Ladder's state, shared by the page and its top-bar stepper and action,
 * which live apart: the hex on show, its payload, what's selected, and which
 * dialog is open.
 */

type GoalDialog = { mode: "add" } | { mode: "edit"; goalId: string };

interface LadderState {
  /** The hex asked for; null follows the current one. */
  hex: HexRef | null;
  data: LadderPayload | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  /** A selected stat lights the goals that feed it; a goal, its stats. */
  stat: StatKey | null;
  goalId: string | null;
  buildOpen: boolean;
  goalDialog: GoalDialog | null;
  load: () => Promise<void>;
  showHex: (hex: HexRef | null) => void;
  step: (direction: -1 | 1) => void;
  selectStat: (key: StatKey | null) => void;
  selectGoal: (id: string | null) => void;
  setBuildOpen: (open: boolean) => void;
  setGoalDialog: (dialog: GoalDialog | null) => void;
}

/** Answers can land out of order when the hex is stepped fast; only the last ask counts. */
let latest = 0;

export const useLadderStore = create<LadderState>()((set, get) => ({
  hex: null,
  data: null,
  status: "idle",
  error: null,
  stat: null,
  goalId: null,
  buildOpen: false,
  goalDialog: null,

  load: async () => {
    const ask = ++latest;
    const { hex } = get();
    set((s) => ({ status: s.data ? s.status : "loading" }));
    try {
      const res = await fetch(
        hex ? `/api/erwin/ladder?year=${hex.year}&index=${hex.index}` : "/api/erwin/ladder"
      );
      if (!res.ok) throw new Error(`The Ladder couldn't load (${res.status})`);
      const data = (await res.json()) as LadderPayload;
      if (ask === latest) set({ data, status: "ready", error: null });
    } catch (e) {
      if (ask === latest) {
        set({ status: "error", error: e instanceof Error ? e.message : "The Ladder couldn't load" });
      }
    }
  },

  showHex: (hex) => {
    set({ hex });
    void get().load();
  },

  step: (direction) => {
    const shown = get().hex ?? get().data?.current;
    if (!shown) return;
    const order = shown.year * 6 + (shown.index - 1) + direction;
    const next = { year: Math.floor(order / 6), index: (order % 6) + 1 };
    const current = get().data?.current;
    get().showHex(current && current.year === next.year && current.index === next.index ? null : next);
  },

  selectStat: (stat) => set({ stat, goalId: null }),
  selectGoal: (goalId) => set({ goalId, stat: null }),
  setBuildOpen: (buildOpen) => set({ buildOpen }),
  setGoalDialog: (goalDialog) => set({ goalDialog }),
}));
