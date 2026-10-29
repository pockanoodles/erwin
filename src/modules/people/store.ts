import { create } from "zustand";

import type {
  InteractionRow,
  PersonInput,
  PersonRow,
} from "@/modules/people/types";

export type PeopleView = "all" | "due" | "archived";

/** "new" while the pane holds a person who isn't saved yet. */
export type PeopleSelection = string | "new" | null;

interface PeopleStore {
  view: PeopleView;
  people: PersonRow[];
  archived: PersonRow[];
  status: "idle" | "loading" | "ready" | "error";
  selected: PeopleSelection;
  interactions: Record<string, InteractionRow[]>;
  setView: (view: PeopleView) => void;
  select: (id: PeopleSelection) => void;
  load: () => Promise<void>;
  loadInteractions: (personId: string) => Promise<void>;
  create: (input: PersonInput & { name: string }) => Promise<PersonRow | null>;
  update: (id: string, input: PersonInput) => Promise<PersonRow | null>;
  log: (
    personId: string,
    input: { kind: string; note: string | null; at?: string }
  ) => Promise<boolean>;
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

const send = (url: string, method: string, body: unknown) =>
  fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * The People page's state. Everything reloads after a write, because one
 * write can move a person's next check-in and their reach-out task.
 */
export const usePeopleStore = create<PeopleStore>()((set, get) => ({
  view: "all",
  people: [],
  archived: [],
  status: "idle",
  selected: null,
  interactions: {},

  setView: (view) => set({ view, selected: null }),
  select: (selected) => set({ selected }),

  load: async () => {
    if (get().status === "idle") set({ status: "loading" });
    try {
      const [active, archived] = await Promise.all([
        fetch("/api/sigwald/people").then((r) =>
          json<{ people: PersonRow[] }>(r)
        ),
        fetch("/api/sigwald/people?archived=1").then((r) =>
          json<{ people: PersonRow[] }>(r)
        ),
      ]);
      set({
        people: active.people,
        archived: archived.people,
        status: "ready",
      });
    } catch {
      set({ status: "error" });
    }
  },

  loadInteractions: async (personId) => {
    try {
      const body = await json<{ interactions: InteractionRow[] }>(
        await fetch(`/api/sigwald/people/${personId}/interactions`)
      );
      set((s) => ({
        interactions: { ...s.interactions, [personId]: body.interactions },
      }));
    } catch {
      // The history is a convenience; the pane says when it's empty.
    }
  },

  create: async (input) => {
    try {
      const { person } = await json<{ person: PersonRow }>(
        await send("/api/sigwald/people", "POST", input)
      );
      await get().load();
      set({ selected: person.id });
      return person;
    } catch {
      return null;
    }
  },

  update: async (id, input) => {
    try {
      const { person } = await json<{ person: PersonRow }>(
        await send(`/api/sigwald/people/${id}`, "PATCH", input)
      );
      await get().load();
      return person;
    } catch {
      return null;
    }
  },

  log: async (personId, input) => {
    try {
      await json(
        await send(`/api/sigwald/people/${personId}/interactions`, "POST", input)
      );
      await Promise.all([get().load(), get().loadInteractions(personId)]);
      return true;
    } catch {
      return false;
    }
  },
}));

const WEEK_MS = 7 * 86_400_000;

/** The rows a view shows, in its order. */
export function peopleInView(
  view: PeopleView,
  people: PersonRow[],
  archived: PersonRow[],
  now: Date
): PersonRow[] {
  if (view === "archived") return archived;
  const byNext = [...people].sort((a, b) => {
    // Soonest check-in first; people with no cadence after, by name.
    if (a.nextCheckIn && b.nextCheckIn) {
      return a.nextCheckIn.localeCompare(b.nextCheckIn);
    }
    if (a.nextCheckIn) return -1;
    if (b.nextCheckIn) return 1;
    return a.name.localeCompare(b.name);
  });
  if (view === "all") return byNext;
  return byNext.filter(
    (p) =>
      p.nextCheckIn != null &&
      new Date(p.nextCheckIn).getTime() <= now.getTime() + WEEK_MS
  );
}
