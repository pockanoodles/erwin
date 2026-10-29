import { create } from "zustand";

import { localDay, shiftDay } from "@/lib/date-utils";

import type {
  ContactInput,
  ContactRow,
  JobInput,
  JobRow,
  NextShift,
  PeriodRow,
  ShiftInput,
  ShiftPatch,
  ShiftRow,
} from "@/modules/work/types";

import { invalidateResources } from "@/hooks/use-resource";

export type WorkView = "shifts" | "hours" | "contacts" | "jobs";

/**
 * What the pane holds: a shift (Shifts), a pay period as "<job id>:<first
 * day>" (Hours), a contact (Contacts) or a job (Jobs) by id, or "new" while
 * one that isn't saved yet is being made.
 */
export type WorkSelection = string | "new" | null;

/** How many weeks before this one Shifts lists. */
const WEEKS_BACK = 8;
/** How far ahead it reaches: every shift a schedule could hold. */
const DAYS_AHEAD = 366;
/** The top bar's next shift is asked for again after this, or on a write. */
const FRESH_MS = 60_000;

interface WorkStore {
  view: WorkView;
  /** The jobs worked now, by name. */
  jobs: JobRow[];
  archived: JobRow[];
  /** Every job's shifts from WEEKS_BACK weeks ago on, soonest first. */
  shifts: ShiftRow[];
  /** Each job's pay periods, newest first (empty without a pay period). */
  periods: Record<string, PeriodRow[]>;
  contacts: Record<string, ContactRow[]>;
  status: "idle" | "loading" | "ready" | "error";
  /** Bumped by each load, so a pane that fetches for itself knows to again. */
  loadedAt: number;
  selected: WorkSelection;
  /** The shift on now or next, for the top bar on every page. */
  next: NextShift | null;
  nextFetchedAt: number | null;
  setView: (view: WorkView) => void;
  select: (id: WorkSelection) => void;
  /** Switches view and selects in one step, for links between views. */
  open: (view: WorkView, id: WorkSelection) => void;
  load: () => Promise<void>;
  /** Throttled to once a minute unless forced; navigation calls it freely. */
  loadNext: (opts?: { force?: boolean }) => Promise<void>;
  createJob: (input: JobInput & { name: string }) => Promise<JobRow | null>;
  updateJob: (id: string, input: JobInput) => Promise<JobRow | null>;
  deleteJob: (id: string) => Promise<boolean>;
  addShift: (jobId: string, input: ShiftInput) => Promise<ShiftRow | null>;
  updateShift: (id: string, patch: ShiftPatch) => Promise<ShiftRow | null>;
  deleteShift: (id: string) => Promise<boolean>;
  submitPeriod: (jobId: string, first: string) => Promise<PeriodRow | null>;
  reopenPeriod: (jobId: string, first: string) => Promise<PeriodRow | null>;
  addContact: (
    jobId: string,
    input: ContactInput & { name: string }
  ) => Promise<ContactRow | null>;
  updateContact: (
    id: string,
    input: ContactInput
  ) => Promise<ContactRow | null>;
  deleteContact: (id: string) => Promise<boolean>;
  /** A period's shifts, for its pane: periods reach back further than `shifts`. */
  periodShifts: (
    jobId: string,
    first: string,
    last: string
  ) => Promise<ShiftRow[] | null>;
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

/** The first moment of a day here, as the API's `from`/`to` take it. */
const startOf = (day: string) => new Date(`${day}T00:00:00`).toISOString();

/** The same request for each job, keyed by its id. */
async function perJob<T>(
  jobs: JobRow[],
  get: (id: string) => Promise<T>
): Promise<Record<string, T>> {
  return Object.fromEntries(
    await Promise.all(jobs.map(async (j) => [j.id, await get(j.id)] as const))
  );
}

/** A period's key in the selection and the Hours sheet. */
export const periodKey = (p: Pick<PeriodRow, "jobId" | "first">) =>
  `${p.jobId}:${p.first}`;

/**
 * The Work page's state. Everything reloads after a write, because one
 * shift can move a week's hours, a period's pay, its "Submit hours" task and
 * the next shift in the top bar.
 */
export const useWorkStore = create<WorkStore>()((set, get) => {
  /** A write, then the reload it calls for; null when it failed. */
  const write = async <T>(
    url: string,
    method: string,
    body?: unknown
  ): Promise<T | null> => {
    try {
      const out = await json<T>(await send(url, method, body));
      await get().load();
      return out;
    } catch {
      return null;
    }
  };

  return {
    view: "shifts",
    jobs: [],
    archived: [],
    shifts: [],
    periods: {},
    contacts: {},
    status: "idle",
    loadedAt: 0,
    selected: null,
    next: null,
    nextFetchedAt: null,

    setView: (view) => set({ view, selected: null }),
    select: (selected) => set({ selected }),
    open: (view, selected) => set({ view, selected }),

    load: async () => {
      if (get().status === "idle") set({ status: "loading" });
      // What Focus and the task sheet show for a timesheet task is read from
      // the same data; a reload means it may have moved.
      invalidateResources("/api/sigwald/work/");
      try {
        // The jobs first: reading them turns timesheet tasks ticked off
        // elsewhere into submitted hours, which the other lists then include.
        const active = await json<{ jobs: JobRow[] }>(
          await fetch("/api/sigwald/work/jobs")
        );
        const today = localDay(new Date());
        // Back to the start of a week, so the oldest week listed is whole.
        const weekFirst = active.jobs[0]?.week.first ?? today;
        const range = new URLSearchParams({
          from: startOf(shiftDay(weekFirst, -7 * WEEKS_BACK)),
          to: startOf(shiftDay(today, DAYS_AHEAD)),
        });
        const [archived, shifts, periods, contacts] = await Promise.all([
          fetch("/api/sigwald/work/jobs?archived=1").then((r) =>
            json<{ jobs: JobRow[] }>(r)
          ),
          fetch(`/api/sigwald/work/shifts?${range}`).then((r) =>
            json<{ shifts: ShiftRow[] }>(r)
          ),
          perJob(active.jobs, async (id) => {
            const body = await json<{ periods: PeriodRow[] }>(
              await fetch(`/api/sigwald/work/jobs/${id}/periods`)
            );
            return body.periods;
          }),
          perJob(active.jobs, async (id) => {
            const body = await json<{ contacts: ContactRow[] }>(
              await fetch(`/api/sigwald/work/jobs/${id}/contacts`)
            );
            return body.contacts;
          }),
        ]);
        set({
          jobs: active.jobs,
          archived: archived.jobs,
          shifts: shifts.shifts,
          periods,
          contacts,
          status: "ready",
          loadedAt: Date.now(),
        });
      } catch {
        set({ status: "error" });
      }
      // A dropped or added shift can change what the top bar says is next.
      void get().loadNext({ force: true });
    },

    loadNext: async ({ force = false } = {}) => {
      const { nextFetchedAt } = get();
      if (
        !force &&
        nextFetchedAt != null &&
        Date.now() - nextFetchedAt < FRESH_MS
      ) {
        return;
      }
      set({ nextFetchedAt: Date.now() });
      try {
        const { shift } = await json<{ shift: NextShift | null }>(
          await fetch("/api/sigwald/work/next")
        );
        set({ next: shift });
      } catch {
        // The top bar is a glance; it stays as it was until the next try.
      }
    },

    createJob: async (input) => {
      const out = await write<{ job: JobRow }>(
        "/api/sigwald/work/jobs",
        "POST",
        input
      );
      if (out) set({ selected: out.job.id });
      return out?.job ?? null;
    },

    updateJob: async (id, input) =>
      (
        await write<{ job: JobRow }>(
          `/api/sigwald/work/jobs/${id}`,
          "PATCH",
          input
        )
      )?.job ?? null,

    deleteJob: async (id) => {
      const ok = (await write(`/api/sigwald/work/jobs/${id}`, "DELETE")) !== null;
      if (ok && get().selected === id) set({ selected: null });
      return ok;
    },

    addShift: async (jobId, input) => {
      const out = await write<{ shift: ShiftRow }>(
        `/api/sigwald/work/jobs/${jobId}/shifts`,
        "POST",
        input
      );
      if (out) set({ selected: out.shift.id });
      return out?.shift ?? null;
    },

    updateShift: async (id, patch) =>
      (
        await write<{ shift: ShiftRow }>(
          `/api/sigwald/work/shifts/${id}`,
          "PATCH",
          patch
        )
      )?.shift ?? null,

    deleteShift: async (id) => {
      const ok =
        (await write(`/api/sigwald/work/shifts/${id}`, "DELETE")) !== null;
      if (ok && get().selected === id) set({ selected: null });
      return ok;
    },

    submitPeriod: async (jobId, first) =>
      (
        await write<{ period: PeriodRow }>(
          `/api/sigwald/work/jobs/${jobId}/periods/${first}`,
          "POST"
        )
      )?.period ?? null,

    reopenPeriod: async (jobId, first) =>
      (
        await write<{ period: PeriodRow }>(
          `/api/sigwald/work/jobs/${jobId}/periods/${first}`,
          "DELETE"
        )
      )?.period ?? null,

    addContact: async (jobId, input) => {
      const out = await write<{ contact: ContactRow }>(
        `/api/sigwald/work/jobs/${jobId}/contacts`,
        "POST",
        input
      );
      if (out) set({ selected: out.contact.id });
      return out?.contact ?? null;
    },

    updateContact: async (id, input) =>
      (
        await write<{ contact: ContactRow }>(
          `/api/sigwald/work/contacts/${id}`,
          "PATCH",
          input
        )
      )?.contact ?? null,

    deleteContact: async (id) => {
      const ok =
        (await write(`/api/sigwald/work/contacts/${id}`, "DELETE")) !== null;
      if (ok && get().selected === id) set({ selected: null });
      return ok;
    },

    periodShifts: async (jobId, first, last) => {
      try {
        // A day wider each side: this browser's midnight isn't the one in
        // the person's Settings zone, which `day` is counted in.
        const range = new URLSearchParams({
          from: startOf(shiftDay(first, -1)),
          to: startOf(shiftDay(last, 2)),
          jobId,
        });
        const { shifts } = await json<{ shifts: ShiftRow[] }>(
          await fetch(`/api/sigwald/work/shifts?${range}`)
        );
        // A period counts the shifts that start in it.
        return shifts.filter((s) => s.day >= first && s.day <= last);
      } catch {
        return null;
      }
    },
  };
});
