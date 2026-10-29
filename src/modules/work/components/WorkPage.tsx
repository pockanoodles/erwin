"use client";

import { useEffect, useMemo } from "react";

import { useSearchParams } from "next/navigation";

import {
  SheetLayout,
  sheetKeyHandler,
  useScrollActiveIntoView,
} from "@/components/sheet/sheet";
import { Button } from "@/components/ui/button";

import { daysBetween, shiftDay } from "@/lib/date-utils";

import {
  ContactPane,
  NewContactPane,
} from "@/modules/work/components/ContactPane";
import { JobPane } from "@/modules/work/components/JobPane";
import { PeriodPane } from "@/modules/work/components/PeriodPane";
import { NewShiftPane, ShiftPane } from "@/modules/work/components/ShiftPane";
import { WeekStrip } from "@/modules/work/components/WeekStrip";
import {
  BandRow,
  COLUMNS,
  ContactCells,
  JobCells,
  type Line,
  PeriodCells,
  Sheet,
  SheetRow,
  ShiftCells,
  contactLines,
  jobLines,
  periodLines,
  shiftLines,
} from "@/modules/work/components/WorkSheets";
import { useTimeFormat } from "@/modules/work/components/parts";
import { type WorkView, periodKey, useWorkStore } from "@/modules/work/store";
import type {
  ContactRow,
  JobRow,
  PeriodRow,
  ShiftRow,
} from "@/modules/work/types";

/**
 * The Work page: the shifts under this week's hours against each job's cap,
 * each pay period's hours (Hours), the people to call (Contacts) and the jobs
 * themselves, as datasheets with the selection whole in the reading pane —
 * the grammar every sheet shares (components/sheet), j/k and arrows
 * included. `?shift=<id>`, `?period=<job id>:<first day>` and `?job=<id>`
 * open one (the top bar and Focus link here).
 */
export function WorkPage() {
  const view = useWorkStore((s) => s.view);
  const jobs = useWorkStore((s) => s.jobs);
  const archived = useWorkStore((s) => s.archived);
  const shifts = useWorkStore((s) => s.shifts);
  const periods = useWorkStore((s) => s.periods);
  const contacts = useWorkStore((s) => s.contacts);
  const status = useWorkStore((s) => s.status);
  const selected = useWorkStore((s) => s.selected);
  const select = useWorkStore((s) => s.select);
  const open = useWorkStore((s) => s.open);
  const load = useWorkStore((s) => s.load);
  const format = useTimeFormat();
  const params = useSearchParams();
  const askedShift = params.get("shift");
  const askedPeriod = params.get("period");
  const askedJob = params.get("job");

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (askedShift) open("shifts", askedShift);
    else if (askedPeriod) open("hours", askedPeriod);
    else if (askedJob) open("jobs", askedJob);
  }, [askedShift, askedPeriod, askedJob, open]);

  // "Now" moves with the data, so what's upcoming refreshes on every reload.
  const now = useMemo(() => new Date(), [shifts, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(
    () => new Map([...jobs, ...archived].map((j) => [j.id, j])),
    [jobs, archived]
  );

  const lines: Line<unknown>[] = useMemo(() => {
    if (view === "shifts") {
      // Weeks start where the server's do: any job's week is the person's.
      const anchor = (jobs[0] ?? archived[0])?.week.first ?? null;
      const weekFirstOf = (day: string) =>
        anchor
          ? shiftDay(anchor, Math.floor(daysBetween(anchor, day) / 7) * 7)
          : day;
      const active = new Set(jobs.map((j) => j.id));
      return shiftLines(
        shifts.filter((s) => active.has(s.jobId)),
        now,
        weekFirstOf
      );
    }
    if (view === "hours") return periodLines(jobs, periods);
    if (view === "contacts") return contactLines(jobs, contacts);
    return jobLines(jobs, archived);
  }, [view, jobs, archived, shifts, periods, contacts, now]);

  const activeIndex = lines.findIndex(
    (l) => l.id !== null && l.id === selected
  );

  useScrollActiveIntoView([selected]);
  const onKeyDown = sheetKeyHandler({
    count: lines.length,
    active: activeIndex,
    isSelectable: (i) => lines[i].id !== null,
    select: (i) => select(lines[i].id),
  });

  const found = activeIndex >= 0 ? lines[activeIndex] : null;
  const picked = found && found.id !== null ? found.row : null;
  const noJobs = status === "ready" && jobs.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetLayout
        label="Work"
        onKeyDown={(e) => void onKeyDown(e)}
        sheet={
          <>
            {view === "shifts" ? (
              <WeekStrip jobs={jobs} onSetCap={(id) => open("jobs", id)} />
            ) : null}
            {noJobs && view !== "jobs" ? null : (
              <Sheet columns={COLUMNS[view]}>
                {lines.map((line, i) =>
                  line.id === null ? (
                    <BandRow
                      key={line.key}
                      index={i + 1}
                      line={line}
                      view={view}
                      onSetUp={(id) => open("jobs", id)}
                    />
                  ) : (
                    <SheetRow
                      key={line.key}
                      index={i + 1}
                      active={line.id === selected}
                      onSelect={() => select(line.id)}
                    >
                      {view === "shifts" ? (
                        <ShiftCells
                          shift={line.row as ShiftRow}
                          job={byId.get((line.row as ShiftRow).jobId)}
                          now={now}
                          format={format}
                          active={line.id === selected}
                        />
                      ) : view === "hours" ? (
                        <PeriodCells
                          {...(line.row as { job: JobRow; period: PeriodRow })}
                          active={line.id === selected}
                        />
                      ) : view === "contacts" ? (
                        <ContactCells
                          contact={
                            (line.row as { contact: ContactRow }).contact
                          }
                          active={line.id === selected}
                        />
                      ) : (
                        <JobCells
                          job={line.row as JobRow}
                          active={line.id === selected}
                        />
                      )}
                    </SheetRow>
                  )
                )}
              </Sheet>
            )}
            {noJobs ? (
              <EmptyState
                archived={archived.length}
                onAdd={() => open("jobs", "new")}
              />
            ) : null}
            {status === "error" ? (
              <p className="p-6 text-sm text-destructive">
                Work couldn&apos;t load. Try again in a moment.
              </p>
            ) : null}
          </>
        }
        pane={
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Pane
              view={view}
              selected={selected}
              picked={picked}
              jobs={jobs}
              byId={byId}
              onAdd={(v) => open(v, "new")}
            />
          </div>
        }
      />
    </div>
  );
}

/** The reading pane: the selection whole, a new one being made, or a hint. */
function Pane({
  view,
  selected,
  picked,
  jobs,
  byId,
  onAdd,
}: {
  view: WorkView;
  selected: string | null;
  picked: unknown;
  jobs: JobRow[];
  byId: Map<string, JobRow>;
  onAdd: (view: WorkView) => void;
}) {
  if (view === "shifts") {
    if (selected === "new" && jobs.length > 0) {
      return <NewShiftPane jobs={jobs} />;
    }
    const shift = picked as ShiftRow | null;
    return shift ? (
      <ShiftPane key={shift.id} shift={shift} job={byId.get(shift.jobId)} />
    ) : (
      <Hint>Select a shift to see it here.</Hint>
    );
  }
  if (view === "hours") {
    const row = picked as { job: JobRow; period: PeriodRow } | null;
    return row ? (
      <PeriodPane
        key={periodKey(row.period)}
        job={row.job}
        period={row.period}
      />
    ) : (
      <Hint>Select a pay period to see its shifts and pay here.</Hint>
    );
  }
  if (view === "contacts") {
    if (selected === "new" && jobs.length > 0) {
      return <NewContactPane jobs={jobs} />;
    }
    const row = picked as { job: JobRow; contact: ContactRow } | null;
    return row ? (
      <ContactPane key={row.contact.id} contact={row.contact} job={row.job} />
    ) : (
      <Hint
        action={
          jobs.length > 0
            ? { label: "New contact", onClick: () => onAdd("contacts") }
            : undefined
        }
      >
        Select someone to see them here, or add the people you call about
        shifts.
      </Hint>
    );
  }
  if (selected === "new") return <JobPane key="new" job={null} />;
  const job = picked as JobRow | null;
  return job ? (
    <JobPane key={job.id} job={job} />
  ) : (
    <Hint action={{ label: "New job", onClick: () => onAdd("jobs") }}>
      Select a job to change it: its pay, pay period, weekly cap and links.
    </Hint>
  );
}

function Hint({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">{children}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="er-brackets h-8 px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function EmptyState({
  archived,
  onAdd,
}: {
  archived: number;
  onAdd: () => void;
}) {
  if (archived > 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Every job is archived. Restore one in Jobs, or add the one you work now.
      </p>
    );
  }
  return (
    <div className="max-w-xl space-y-5 p-6 md:p-10">
      <p className="er-label">No jobs yet</p>
      <p className="text-lg leading-relaxed text-foreground">
        Add the jobs you work shifts at. Sigwald puts each shift on the calendar,
        adds up your hours against your weekly cap, and reminds you to hand in
        your timesheet each pay period.
      </p>
      <Button onClick={onAdd}>Add job</Button>
    </div>
  );
}
