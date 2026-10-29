import { create } from "zustand";

import { localDay } from "@/lib/date-utils";

import {
  type Macros,
  type Targets,
  dayTotals,
} from "@/modules/nutrition/macros";
import type {
  DayRow,
  EntryInput,
  FoodInput,
  FoodRow,
} from "@/modules/nutrition/types";

export type NutritionView = "day" | "foods";

/**
 * What the pane holds. In Day: an entry by id, "targets", or null for
 * adding food. In Foods: a food by id, "new", or null.
 */
export type NutritionSelection = string | null;

/** Today's totals, for the top bar's count on every page. */
interface Today {
  day: string;
  eaten: Macros;
  targets: Targets;
}

interface NutritionStore {
  view: NutritionView;
  /** The day the page shows; null until it first loads (then today). */
  day: string | null;
  shown: DayRow | null;
  /** Saved foods, the usual first. */
  foods: FoodRow[];
  archivedFoods: FoodRow[];
  status: "idle" | "loading" | "ready" | "error";
  selected: NutritionSelection;
  today: Today | null;
  todayFetchedAt: number | null;
  setView: (view: NutritionView) => void;
  select: (selection: NutritionSelection) => void;
  setDay: (day: string) => Promise<void>;
  load: () => Promise<void>;
  /** Throttled to once a minute unless forced; navigation calls it freely. */
  loadToday: (opts?: { force?: boolean }) => Promise<void>;
  add: (input: EntryInput) => Promise<boolean>;
  editEntry: (
    id: string,
    input: Partial<FoodInput & { servings: number }>
  ) => Promise<boolean>;
  removeEntry: (id: string) => Promise<boolean>;
  saveFood: (input: FoodInput) => Promise<FoodRow | null>;
  updateFood: (
    id: string,
    input: Partial<FoodInput & { archived: boolean }>
  ) => Promise<boolean>;
  setTargets: (targets: Targets) => Promise<boolean>;
}

const FRESH_MS = 60_000;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

const send = (url: string, method: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const fetchDay = async (day: string) =>
  json<DayRow>(await fetch(`/api/sigwald/nutrition/day?day=${day}`));

const todayOf = (row: DayRow): Today => ({
  day: row.day,
  eaten: dayTotals(row.entries),
  targets: row.targets,
});

/**
 * The Nutrition page's state, and today's totals for the top bar. A write
 * reloads the day it touched, and today's count when that day is today.
 */
export const useNutritionStore = create<NutritionStore>()((set, get) => {
  const loadFoods = async () => {
    const [active, archived] = await Promise.all(
      [
        "/api/sigwald/nutrition/foods",
        "/api/sigwald/nutrition/foods?archived=1",
      ].map(
        async (url) =>
          (await json<{ foods: FoodRow[] }>(await fetch(url))).foods
      )
    );
    set({ foods: active, archivedFoods: archived });
  };

  const attempt = async (write: () => Promise<unknown>) => {
    try {
      await write();
      // The shown day and the foods again: a write can change both.
      await get().load();
      return true;
    } catch {
      return false;
    }
  };

  return {
    view: "day",
    day: null,
    shown: null,
    foods: [],
    archivedFoods: [],
    status: "idle",
    selected: null,
    today: null,
    todayFetchedAt: null,

    setView: (view) => set({ view, selected: null }),
    select: (selected) => set({ selected }),

    setDay: async (day) => {
      set({ day, selected: null });
      await get().load();
    },

    load: async () => {
      if (get().status === "idle") set({ status: "loading" });
      const day = get().day ?? localDay(new Date());
      try {
        const [shown] = await Promise.all([fetchDay(day), loadFoods()]);
        // A slower answer for a day that's no longer shown is dropped.
        if ((get().day ?? day) !== day) return;
        set({ day, shown, status: "ready" });
        if (day === localDay(new Date())) {
          set({ today: todayOf(shown), todayFetchedAt: Date.now() });
        }
      } catch {
        set({ status: "error" });
      }
    },

    loadToday: async ({ force = false } = {}) => {
      const { todayFetchedAt } = get();
      if (
        !force &&
        todayFetchedAt != null &&
        Date.now() - todayFetchedAt < FRESH_MS
      ) {
        return;
      }
      set({ todayFetchedAt: Date.now() });
      try {
        set({ today: todayOf(await fetchDay(localDay(new Date()))) });
      } catch {
        // The count is a glance; it stays as it was until the next try.
      }
    },

    add: (input) =>
      attempt(async () =>
        json(await send("/api/sigwald/nutrition/entries", "POST", input))
      ),

    editEntry: (id, input) =>
      attempt(async () =>
        json(await send(`/api/sigwald/nutrition/entries/${id}`, "PATCH", input))
      ),

    removeEntry: async (id) => {
      const ok = await attempt(async () =>
        json(await send(`/api/sigwald/nutrition/entries/${id}`, "DELETE"))
      );
      if (ok && get().selected === id) set({ selected: null });
      return ok;
    },

    saveFood: async (input) => {
      try {
        const { food } = await json<{ food: FoodRow }>(
          await send("/api/sigwald/nutrition/foods", "POST", input)
        );
        await get().load();
        return food;
      } catch {
        return null;
      }
    },

    updateFood: (id, input) =>
      attempt(async () =>
        json(await send(`/api/sigwald/nutrition/foods/${id}`, "PATCH", input))
      ),

    setTargets: (targets) =>
      attempt(async () =>
        json(await send("/api/sigwald/nutrition/targets", "PUT", targets))
      ),
  };
});
