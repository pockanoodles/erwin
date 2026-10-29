import { create } from "zustand";

import type { Unit } from "@/modules/training/sets";
import type {
  RoutineInput,
  RoutineRow,
  WorkoutInput,
  WorkoutRow,
} from "@/modules/training/types";

import { invalidateResources } from "@/hooks/use-resource";

export type TrainingView = "routines" | "history" | "archived";

/**
 * What the pane holds: a routine (Routines, Archived) or a session (History)
 * by id, or "new" while a routine that isn't saved yet is being made.
 */
export type TrainingSelection = string | "new" | null;

interface TrainingStore {
  view: TrainingView;
  routines: RoutineRow[];
  archived: RoutineRow[];
  /** Every routine's sessions, newest first, for History. */
  workouts: WorkoutRow[];
  /** Each routine's own sessions, newest first, loaded as it's opened. */
  history: Record<string, WorkoutRow[]>;
  /** The unit weights were last entered in; null before any. */
  unit: Unit | null;
  status: "idle" | "loading" | "ready" | "error";
  selected: TrainingSelection;
  setView: (view: TrainingView) => void;
  select: (id: TrainingSelection) => void;
  load: () => Promise<void>;
  loadHistory: (routineId: string) => Promise<void>;
  create: (
    input: RoutineInput & { name: string }
  ) => Promise<RoutineRow | null>;
  update: (id: string, input: RoutineInput) => Promise<RoutineRow | null>;
  log: (routineId: string, input: WorkoutInput) => Promise<boolean>;
  edit: (workout: WorkoutRow, input: Partial<WorkoutInput>) => Promise<boolean>;
  remove: (workout: WorkoutRow) => Promise<boolean>;
}

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

/**
 * The Training page's state. Everything reloads after a write, because one
 * session can move a routine's next day, its workout task and the history.
 */
export const useTrainingStore = create<TrainingStore>()((set, get) => {
  const reloadAfter = async (routineId: string) => {
    await Promise.all([get().load(), get().loadHistory(routineId)]);
  };

  return {
    view: "routines",
    routines: [],
    archived: [],
    workouts: [],
    history: {},
    unit: null,
    status: "idle",
    selected: null,

    setView: (view) => set({ view, selected: null }),
    select: (selected) => set({ selected }),

    load: async () => {
      if (get().status === "idle") set({ status: "loading" });
      // What Focus and the task sheet show for a workout task is read from
      // the same data; a reload means it may have moved.
      invalidateResources("/api/sigwald/training/");
      try {
        // The routines first: reading them turns workout tasks ticked off
        // elsewhere into sessions, which the other two lists then include.
        const active = await json<{
          routines: RoutineRow[];
          unit: Unit | null;
        }>(await fetch("/api/sigwald/training/routines"));
        const [archived, all] = await Promise.all([
          fetch("/api/sigwald/training/routines?archived=1").then((r) =>
            json<{ routines: RoutineRow[] }>(r)
          ),
          fetch("/api/sigwald/training/workouts").then((r) =>
            json<{ workouts: WorkoutRow[] }>(r)
          ),
        ]);
        set({
          routines: active.routines,
          archived: archived.routines,
          workouts: all.workouts,
          unit: active.unit,
          status: "ready",
        });
      } catch {
        set({ status: "error" });
      }
    },

    loadHistory: async (routineId) => {
      try {
        const body = await json<{ workouts: WorkoutRow[] }>(
          await fetch(`/api/sigwald/training/routines/${routineId}/workouts`)
        );
        set((s) => ({ history: { ...s.history, [routineId]: body.workouts } }));
      } catch {
        // The history is a convenience; the pane says when it's empty.
      }
    },

    create: async (input) => {
      try {
        const { routine } = await json<{ routine: RoutineRow }>(
          await send("/api/sigwald/training/routines", "POST", input)
        );
        await get().load();
        set({ selected: routine.id });
        return routine;
      } catch {
        return null;
      }
    },

    update: async (id, input) => {
      try {
        const { routine } = await json<{ routine: RoutineRow }>(
          await send(`/api/sigwald/training/routines/${id}`, "PATCH", input)
        );
        await get().load();
        return routine;
      } catch {
        return null;
      }
    },

    log: async (routineId, input) => {
      try {
        await json(
          await send(
            `/api/sigwald/training/routines/${routineId}/workouts`,
            "POST",
            input
          )
        );
        await reloadAfter(routineId);
        return true;
      } catch {
        return false;
      }
    },

    edit: async (workout, input) => {
      try {
        await json(
          await send(
            `/api/sigwald/training/workouts/${workout.id}`,
            "PATCH",
            input
          )
        );
        await reloadAfter(workout.routineId);
        return true;
      } catch {
        return false;
      }
    },

    remove: async (workout) => {
      try {
        await json(
          await send(`/api/sigwald/training/workouts/${workout.id}`, "DELETE")
        );
        if (get().selected === workout.id) set({ selected: null });
        await reloadAfter(workout.routineId);
        return true;
      } catch {
        return false;
      }
    },
  };
});

/** The routines a view lists: soonest session first, unscheduled after by name. */
export function routinesInView(
  view: TrainingView,
  routines: RoutineRow[],
  archived: RoutineRow[]
): RoutineRow[] {
  if (view === "archived") return archived;
  return [...routines].sort((a, b) => {
    if (a.nextDue && b.nextDue) {
      return a.nextDue.localeCompare(b.nextDue) || a.name.localeCompare(b.name);
    }
    if (a.nextDue) return -1;
    if (b.nextDue) return 1;
    return a.name.localeCompare(b.name);
  });
}
