"use client";

import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { Tag } from "@/components/sheet/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { localDay } from "@/lib/date-utils";

import {
  ChoiceChip,
  DeleteButton,
  Field,
  JobDot,
  PaneSection,
  ReachLinks,
  atOn,
  clockOf,
  dayText,
  hoursText,
  nearestAt,
  nextAt,
  spanText,
  useTimeFormat,
} from "@/modules/work/components/parts";
import { useWorkStore } from "@/modules/work/store";
import type {
  JobRow,
  ShiftInput,
  ShiftPatch,
  ShiftRow,
} from "@/modules/work/types";

/** A shift as typed: times stay "HH:mm" until it's saved. */
interface Draft {
  title: string;
  day: string;
  start: string;
  end: string;
  location: string;
  role: string;
  supervisor: string;
  /** Blank means as scheduled. */
  workedStart: string;
  workedEnd: string;
  note: string;
}

function draftOf(s: ShiftRow): Draft {
  return {
    title: s.title,
    day: localDay(new Date(s.start)),
    start: clockOf(s.start),
    end: clockOf(s.end),
    location: s.location ?? "",
    role: s.role ?? "",
    supervisor: s.supervisor ?? "",
    workedStart: s.workedStart ? clockOf(s.workedStart) : "",
    workedEnd: s.workedEnd ? clockOf(s.workedEnd) : "",
    note: s.note ?? "",
  };
}

const orNull = (v: string) => v.trim() || null;

/**
 * What a draft changes, as the API takes it, or why it can't be saved. An
 * imported shift sends only what any shift takes (the times worked and the
 * note); the schedule owns the rest.
 */
function patchOf(d: Draft, s: ShiftRow): ShiftPatch | string {
  const patch: ShiftPatch = {};
  let start = new Date(s.start);
  let end = new Date(s.end);
  if (s.byHand) {
    const title = d.title.trim();
    if (!title) return "A shift needs a title.";
    const from = atOn(d.day, d.start);
    const to = from ? nextAt(d.end, from) : null;
    if (!from || !to) return "Give it a day, a start and an end.";
    start = from;
    end = to;
    if (title !== s.title) patch.title = title;
    if (start.toISOString() !== s.start) patch.start = start.toISOString();
    if (end.toISOString() !== s.end) patch.end = end.toISOString();
    for (const key of ["location", "role", "supervisor"] as const) {
      const value = orNull(d[key]);
      if (value !== s[key]) patch[key] = value;
    }
  }
  // A worked time the same as the schedule's is no change at all.
  const workedStart = d.workedStart ? nearestAt(d.workedStart, start) : null;
  const workedEnd = d.workedEnd
    ? nextAt(d.workedEnd, workedStart ?? start)
    : null;
  const ws =
    workedStart && workedStart.getTime() !== start.getTime()
      ? workedStart.toISOString()
      : null;
  const we =
    workedEnd && workedEnd.getTime() !== end.getTime()
      ? workedEnd.toISOString()
      : null;
  if (ws !== s.workedStart) patch.workedStart = ws;
  if (we !== s.workedEnd) patch.workedEnd = we;
  const note = orNull(d.note);
  if (note !== s.note) patch.note = note;
  return patch;
}

/** Dropped, on the timesheet, worked, on now, or nothing yet. */
export function ShiftStatus({ shift: s, now }: { shift: ShiftRow; now: Date }) {
  if (s.dropped) return <Tag>Dropped</Tag>;
  if (s.loggedAt) return <Tag tone="ok">On timesheet</Tag>;
  if (s.worked) return <Tag>Worked</Tag>;
  if (new Date(s.workedStart ?? s.start) <= now) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-wide text-rust-text">
        On now
      </span>
    );
  }
  return null;
}

/**
 * One shift, whole: when it runs, who to call, the times you actually
 * worked, a note, what the schedule said, and dropping it. One added by hand
 * can change everything and be deleted; an imported one keeps the
 * schedule's times, since the next import would put them back.
 */
export function ShiftPane({ shift, job }: { shift: ShiftRow; job?: JobRow }) {
  const updateShift = useWorkStore((s) => s.updateShift);
  const deleteShift = useWorkStore((s) => s.deleteShift);
  const contacts = useWorkStore((s) => s.contacts[shift.jobId]);
  const format = useTimeFormat();
  const [draft, setDraft] = useState<Draft>(() => draftOf(shift));
  const [saving, setSaving] = useState(false);

  // Saved values that change (a save, a reload) replace the draft; a reload
  // that changes nothing here leaves unsaved edits alone.
  const baseKey = JSON.stringify(draftOf(shift));
  useEffect(() => {
    setDraft(JSON.parse(baseKey) as Draft);
  }, [baseKey]);

  const patch = useMemo(() => patchOf(draft, shift), [draft, shift]);
  const dirty = typeof patch === "string" || Object.keys(patch).length > 0;
  const changedTimes = shift.workedStart !== null || shift.workedEnd !== null;

  const save = async () => {
    if (typeof patch === "string") {
      toast.error(patch);
      return;
    }
    setSaving(true);
    const saved = await updateShift(shift.id, patch);
    setSaving(false);
    if (!saved) toast.error("Couldn't save. Try again.");
  };

  const setDropped = async (dropped: boolean) => {
    if (!(await updateShift(shift.id, { dropped }))) {
      toast.error("Couldn't change that. Try again.");
    }
  };

  return (
    <div className="space-y-6 p-5">
      <div className="space-y-1">
        <h2 className="er-display text-lg text-foreground">{shift.title}</h2>
        <p className="text-sm tabular-nums text-foreground">
          {dayText(shift.day)} · {spanText(shift, format)} ·{" "}
          {hoursText(shift.hours)}{" "}
          <ShiftStatus shift={shift} now={new Date()} />
        </p>
        {changedTimes ? (
          <p className="text-sm tabular-nums text-muted-foreground">
            Scheduled{" "}
            {spanText({ ...shift, workedStart: null, workedEnd: null }, format)}
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          {job ? (
            <>
              <JobDot color={job.color} />
              <span>{job.name}</span>
            </>
          ) : null}
          {[shift.location, shift.role].filter(Boolean).map((v) => (
            <span key={v}>· {v}</span>
          ))}
        </p>
        {!shift.byHand ? (
          <p className="pt-1 text-[13px] text-muted-foreground">
            From the schedule, so its times change only when the schedule does.
            Drop it here if you gave it away.
          </p>
        ) : null}
      </div>

      {shift.supervisor ? (
        <PaneSection label="Supervisor">
          <p className="text-sm text-foreground">
            {shift.supervisor}
            {shift.contact?.role ? (
              <span className="text-muted-foreground">
                {" "}
                · {shift.contact.role}
              </span>
            ) : null}
          </p>
          {shift.contact ? (
            <ReachLinks contact={shift.contact} />
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Not in this job&apos;s contacts, so there&apos;s no number to
              call.
            </p>
          )}
        </PaneSection>
      ) : null}

      <PaneSection label="Clocked out late?">
        <p className="text-[13px] text-muted-foreground">
          Put in the times you actually worked; the hours follow.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Field id="shift-worked-start" label="Started">
            <Input
              id="shift-worked-start"
              type="time"
              value={draft.workedStart || draft.start}
              onChange={(e) =>
                setDraft({ ...draft, workedStart: e.target.value })
              }
              className="h-8 w-32 tabular-nums"
            />
          </Field>
          <Field id="shift-worked-end" label="Ended">
            <Input
              id="shift-worked-end"
              type="time"
              value={draft.workedEnd || draft.end}
              onChange={(e) =>
                setDraft({ ...draft, workedEnd: e.target.value })
              }
              className="h-8 w-32 tabular-nums"
            />
          </Field>
          {draft.workedStart || draft.workedEnd ? (
            <Button
              variant="quiet"
              className="h-8"
              onClick={() =>
                setDraft({ ...draft, workedStart: "", workedEnd: "" })
              }
            >
              As scheduled
            </Button>
          ) : null}
        </div>
      </PaneSection>

      {shift.byHand ? (
        <PaneSection label="The shift">
          <ShiftFields
            draft={draft}
            onChange={setDraft}
            supervisors={contacts?.map((c) => c.name) ?? []}
          />
        </PaneSection>
      ) : null}

      <PaneSection label="Note">
        <Textarea
          aria-label="Note"
          value={draft.note}
          rows={3}
          placeholder="Anything to remember about this shift"
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
        <div className="pt-1">
          <Button
            variant="secondary"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            Save changes
          </Button>
        </div>
      </PaneSection>

      {shift.details ? (
        <PaneSection label="What the schedule says">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {shift.details}
          </p>
        </PaneSection>
      ) : null}

      <PaneSection label={shift.dropped ? "Dropped" : "Drop it"}>
        <p className="text-sm text-muted-foreground">
          {shift.dropped
            ? "Its hours don't count. Restore it if you're working it after all."
            : "Gave it away or got covered? A dropped shift stays listed, and its hours stop counting."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="quiet"
            onClick={() => void setDropped(!shift.dropped)}
          >
            {shift.dropped ? "Restore" : "Drop shift"}
          </Button>
          {shift.byHand ? (
            <DeleteButton
              onDelete={async () => {
                if (!(await deleteShift(shift.id))) {
                  toast.error("Couldn't delete it. Try again.");
                }
              }}
            />
          ) : null}
        </div>
      </PaneSection>
    </div>
  );
}

/** Title, day, times, place, role and supervisor: what a hand-added shift is. */
function ShiftFields({
  draft,
  onChange,
  supervisors,
  autoFocus,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  /** The job's contacts, offered as the supervisor is typed. */
  supervisors: string[];
  autoFocus?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <Field id="shift-title" label="Title">
        <Input
          id="shift-title"
          value={draft.title}
          autoFocus={autoFocus}
          placeholder="Front desk"
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          autoComplete="off"
        />
      </Field>
      <div className="flex flex-wrap items-end gap-2">
        <Field id="shift-day" label="Day">
          <Input
            id="shift-day"
            type="date"
            value={draft.day}
            onChange={(e) =>
              e.target.value && onChange({ ...draft, day: e.target.value })
            }
            className="h-8 w-[10.5rem]"
          />
        </Field>
        <Field id="shift-start" label="Starts">
          <Input
            id="shift-start"
            type="time"
            value={draft.start}
            onChange={(e) => onChange({ ...draft, start: e.target.value })}
            className="h-8 w-32 tabular-nums"
          />
        </Field>
        <Field id="shift-end" label="Ends">
          <Input
            id="shift-end"
            type="time"
            value={draft.end}
            onChange={(e) => onChange({ ...draft, end: e.target.value })}
            className="h-8 w-32 tabular-nums"
          />
        </Field>
      </div>
      <p className="-mt-1 text-[13px] text-muted-foreground">
        An end before the start is the next morning.
      </p>
      <Field id="shift-place" label="Place">
        <Input
          id="shift-place"
          value={draft.location}
          placeholder="Main library"
          onChange={(e) => onChange({ ...draft, location: e.target.value })}
          autoComplete="off"
        />
      </Field>
      <Field id="shift-role" label="Role">
        <Input
          id="shift-role"
          value={draft.role}
          placeholder="Desk attendant"
          onChange={(e) => onChange({ ...draft, role: e.target.value })}
          autoComplete="off"
        />
      </Field>
      <Field id="shift-supervisor" label="Supervisor">
        <Input
          id="shift-supervisor"
          value={draft.supervisor}
          placeholder="Jamie Ortiz"
          list="shift-supervisors"
          onChange={(e) => onChange({ ...draft, supervisor: e.target.value })}
          autoComplete="off"
        />
        <datalist id="shift-supervisors">
          {supervisors.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </Field>
    </div>
  );
}

const blankDraft = (): Draft => ({
  title: "",
  day: localDay(new Date()),
  start: "09:00",
  end: "17:00",
  location: "",
  role: "",
  supervisor: "",
  workedStart: "",
  workedEnd: "",
  note: "",
});

/** A shift added by hand, held here until it's saved. */
export function NewShiftPane({ jobs }: { jobs: JobRow[] }) {
  const addShift = useWorkStore((s) => s.addShift);
  const select = useWorkStore((s) => s.select);
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const contacts = useWorkStore((s) => s.contacts[jobId]);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const job = jobs.find((j) => j.id === jobId);

  const save = async () => {
    if (!job) return;
    const start = atOn(draft.day, draft.start);
    const end = start ? nextAt(draft.end, start) : null;
    if (!start || !end) {
      toast.error("Give it a day, a start and an end.");
      return;
    }
    const input: ShiftInput = {
      // Untitled, a shift is called by its job, the way the calendar shows it.
      title: draft.title.trim() || job.name,
      start: start.toISOString(),
      end: end.toISOString(),
      location: orNull(draft.location),
      role: orNull(draft.role),
      supervisor: orNull(draft.supervisor),
      note: orNull(draft.note),
    };
    setSaving(true);
    const saved = await addShift(job.id, input);
    setSaving(false);
    if (!saved) toast.error("Couldn't add it. Try again.");
  };

  return (
    <div className="space-y-6 p-5">
      <h2 className="er-display text-lg text-foreground">New shift</h2>
      <PaneSection label="What it is">
        <div className="grid gap-3">
          {jobs.length > 1 ? (
            <Field label="Job">
              <div className="flex flex-wrap gap-1.5 pt-1">
                {jobs.map((j) => (
                  <ChoiceChip
                    key={j.id}
                    on={j.id === jobId}
                    onClick={() => setJobId(j.id)}
                  >
                    <JobDot color={j.color} />
                    {j.name}
                  </ChoiceChip>
                ))}
              </div>
            </Field>
          ) : null}
          <ShiftFields
            draft={draft}
            onChange={setDraft}
            supervisors={contacts?.map((c) => c.name) ?? []}
            autoFocus
          />
          <Field id="shift-note" label="Note">
            <Textarea
              id="shift-note"
              value={draft.note}
              rows={2}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button disabled={saving || !job} onClick={() => void save()}>
            Add
          </Button>
          <Button variant="quiet" onClick={() => select(null)}>
            Cancel
          </Button>
        </div>
      </PaneSection>
    </div>
  );
}
