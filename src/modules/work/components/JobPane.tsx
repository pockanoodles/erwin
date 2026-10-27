"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { DEFAULT_FEED_COLOR } from "@/lib/calendar-colors";

import {
  ChoiceChip,
  DeleteButton,
  Field,
  PaneSection,
  isCurrency,
} from "@/modules/work/components/parts";
import { useWorkStore } from "@/modules/work/store";
import type { JobInput, JobRow } from "@/modules/work/types";

const PERIODS = [
  { days: null, label: "No pay period" },
  { days: 7, label: "Weekly" },
  { days: 14, label: "Every 2 weeks" },
] as const;

type PeriodDays = (typeof PERIODS)[number]["days"];

/** A link as typed, keyed so a row keeps its focus while others move. */
interface LinkLine {
  key: number;
  label: string;
  url: string;
}

/** A job as typed: numbers stay text until it's saved. */
interface Draft {
  name: string;
  color: string;
  hourlyRate: string;
  currency: string;
  payPeriodDays: PeriodDays;
  payPeriodStart: string;
  timesheetDueDays: string;
  timesheetsFrom: string;
  weeklyCapHours: string;
  links: LinkLine[];
  notes: string;
}

/** Every field a job saves, as the API takes it. */
type Values = Required<Omit<JobInput, "archived">> & { name: string };

function draftOf(j: JobRow | null): Draft {
  return {
    name: j?.name ?? "",
    // The calendar's own colour for a feed, until one is picked.
    color: j?.color ?? `${DEFAULT_FEED_COLOR}FF`,
    hourlyRate: j?.hourlyRate == null ? "" : String(j.hourlyRate),
    currency: j?.currency ?? "USD",
    payPeriodDays: (j?.payPeriodDays ?? null) as PeriodDays,
    payPeriodStart: j?.payPeriodStart ?? "",
    timesheetDueDays: String(j?.timesheetDueDays ?? 0),
    timesheetsFrom: j?.timesheetsFrom ?? "",
    weeklyCapHours: j?.weeklyCapHours == null ? "" : String(j.weeklyCapHours),
    links: (j?.links ?? []).map((l, key) => ({ key, ...l })),
    notes: j?.notes ?? "",
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What a draft saves as, or why it can't be saved. Links without an address are dropped. */
function valuesOf(d: Draft): Values | string {
  const name = d.name.trim();
  if (!name) return "A job needs a name.";
  const rate = d.hourlyRate.trim() === "" ? null : Number(d.hourlyRate);
  if (
    rate !== null &&
    !(Number.isFinite(rate) && rate >= 0 && rate <= 10_000)
  ) {
    return "An hourly rate is a number, like 15.50.";
  }
  const currency = d.currency.trim().toUpperCase();
  if (!isCurrency(currency)) return "A currency is a code like USD or EUR.";
  if (d.payPeriodDays !== null && !DAY.test(d.payPeriodStart)) {
    return "Pick a day one pay period starts on.";
  }
  const due = Number(d.timesheetDueDays);
  if (!(Number.isInteger(due) && due >= 0 && due <= 31)) {
    return "Hours are due 0 to 31 days after a period ends.";
  }
  const cap = d.weeklyCapHours.trim() === "" ? null : Number(d.weeklyCapHours);
  if (cap !== null && !(Number.isFinite(cap) && cap > 0 && cap <= 168)) {
    return "A weekly cap is between 0 and 168 hours.";
  }
  return {
    name,
    color: d.color,
    hourlyRate: rate,
    currency,
    payPeriodDays: d.payPeriodDays,
    payPeriodStart: d.payPeriodDays !== null ? d.payPeriodStart : null,
    timesheetDueDays: due,
    timesheetsFrom: DAY.test(d.timesheetsFrom) ? d.timesheetsFrom : null,
    weeklyCapHours: cap,
    links: d.links
      .filter((l) => l.url.trim())
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
    notes: d.notes.trim() || null,
  };
}

/** Only the fields that changed, so a save never rewrites what it didn't touch. */
function changesOf(next: Values, before: Values | string): JobInput {
  if (typeof before === "string") return next;
  return Object.fromEntries(
    (Object.keys(next) as (keyof Values)[])
      .filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]))
      .map((k) => [k, next[k]])
  ) as JobInput;
}

/**
 * One job, whole: its name and colour, its pay, its pay period and when the
 * hours are due, the weekly cap, its links and notes. With no job it's the
 * form for a new one, held here until it's saved.
 */
export function JobPane({ job }: { job: JobRow | null }) {
  const createJob = useWorkStore((s) => s.createJob);
  const updateJob = useWorkStore((s) => s.updateJob);
  const deleteJob = useWorkStore((s) => s.deleteJob);
  const select = useWorkStore((s) => s.select);
  const [draft, setDraft] = useState<Draft>(() => draftOf(job));
  const [saving, setSaving] = useState(false);
  const linkKeys = useRef(job?.links.length ?? 0);

  // Saved values that change (a save, a reload) replace the draft; a reload
  // that changes nothing editable leaves unsaved edits alone.
  const baseKey = JSON.stringify(draftOf(job));
  useEffect(() => {
    setDraft(JSON.parse(baseKey) as Draft);
  }, [baseKey]);

  const values = useMemo(() => valuesOf(draft), [draft]);
  const changes = useMemo(
    () =>
      typeof values === "string" || !job
        ? null
        : changesOf(values, valuesOf(draftOf(job))),
    [values, job]
  );
  const dirty =
    typeof values === "string" ||
    (changes !== null && Object.keys(changes).length > 0);

  const save = async () => {
    if (typeof values === "string") {
      toast.error(values);
      return;
    }
    setSaving(true);
    let saved: JobRow | null;
    if (job) {
      saved = await updateJob(job.id, changes ?? {});
    } else {
      // Left empty, timesheets count from the period you're in now.
      const { timesheetsFrom, ...rest } = values;
      saved = await createJob(timesheetsFrom ? values : rest);
    }
    setSaving(false);
    if (!saved) toast.error("Couldn't save. Try again.");
  };

  const setLink = (key: number, change: Partial<LinkLine>) =>
    setDraft({
      ...draft,
      links: draft.links.map((l) => (l.key === key ? { ...l, ...change } : l)),
    });

  const addLink = () => {
    linkKeys.current += 1;
    setDraft({
      ...draft,
      links: [
        ...draft.links,
        {
          key: linkKeys.current,
          label: draft.links.length === 0 ? "Timesheet" : "",
          url: "",
        },
      ],
    });
  };

  return (
    <div className="space-y-6 p-5">
      <div className="space-y-1">
        <h2 className="er-display text-lg text-foreground">
          {job ? job.name : "New job"}
        </h2>
        {job ? (
          <p className="text-sm text-muted-foreground">
            {job.shiftCount === 1 ? "1 shift" : `${job.shiftCount} shifts`}
            {job.importKey
              ? ` · Filled by the schedule import (${job.importKey})`
              : " · Every shift added by hand"}
          </p>
        ) : null}
      </div>

      <PaneSection label={job ? "The job" : "What it is"}>
        <div className="grid gap-3">
          <Field id="job-name" label="Name">
            <Input
              id="job-name"
              value={draft.name}
              autoFocus={!job}
              placeholder="Library front desk"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              autoComplete="off"
            />
          </Field>
          <Field
            id="job-color"
            label="Colour"
            hint="Its shifts take this colour on the calendar."
          >
            <Input
              id="job-color"
              type="color"
              value={draft.color.slice(0, 7).toLowerCase()}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  // The picker has no alpha; the saved one is kept.
                  color: `${e.target.value}${draft.color.slice(7, 9) || "FF"}`,
                })
              }
              className="h-8 w-14 p-1"
            />
          </Field>
          <div className="flex flex-wrap items-end gap-2">
            <Field id="job-rate" label="Hourly rate">
              <Input
                id="job-rate"
                inputMode="decimal"
                value={draft.hourlyRate}
                placeholder="15.50"
                onChange={(e) =>
                  setDraft({ ...draft, hourlyRate: e.target.value })
                }
                className="h-8 w-28 text-right tabular-nums"
              />
            </Field>
            <Field id="job-currency" label="Currency">
              <Input
                id="job-currency"
                value={draft.currency}
                maxLength={3}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    currency: e.target.value.toUpperCase(),
                  })
                }
                className="h-8 w-20 font-mono uppercase"
                autoComplete="off"
              />
            </Field>
          </div>
          <Field
            id="job-cap"
            label="Weekly cap"
            hint="Hours a week you can work. Shifts warns at or over it."
          >
            <Input
              id="job-cap"
              inputMode="decimal"
              value={draft.weeklyCapHours}
              placeholder="20"
              onChange={(e) =>
                setDraft({ ...draft, weeklyCapHours: e.target.value })
              }
              className="h-8 w-28 text-right tabular-nums"
            />
          </Field>
        </div>
      </PaneSection>

      <PaneSection label="Timesheets">
        <div className="grid gap-3">
          <Field label="Pay period">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PERIODS.map((p) => (
                <ChoiceChip
                  key={p.days ?? "none"}
                  on={draft.payPeriodDays === p.days}
                  onClick={() => setDraft({ ...draft, payPeriodDays: p.days })}
                >
                  {p.label}
                </ChoiceChip>
              ))}
            </div>
          </Field>
          {draft.payPeriodDays === null ? (
            <p className="text-[13px] text-muted-foreground">
              Without a pay period there&apos;s no &ldquo;Submit hours&rdquo;
              task, and Hours has nothing to add up.
            </p>
          ) : (
            <>
              <Field
                id="job-period-start"
                label="First day of any period"
                hint="Any one will do; the rest follow from it."
              >
                <Input
                  id="job-period-start"
                  type="date"
                  value={draft.payPeriodStart}
                  onChange={(e) =>
                    setDraft({ ...draft, payPeriodStart: e.target.value })
                  }
                  className="h-8 w-[10.5rem]"
                />
              </Field>
              <Field id="job-due" label="Hours due">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Input
                    id="job-due"
                    inputMode="numeric"
                    value={draft.timesheetDueDays}
                    onChange={(e) =>
                      setDraft({ ...draft, timesheetDueDays: e.target.value })
                    }
                    className="h-8 w-16 text-right tabular-nums"
                  />
                  days after a period ends
                </span>
              </Field>
              <Field
                id="job-from"
                label="Count timesheets from"
                hint={
                  draft.timesheetsFrom
                    ? "Periods that start before this day get no task."
                    : "Left empty, they count from the period you're in now."
                }
              >
                <Input
                  id="job-from"
                  type="date"
                  value={draft.timesheetsFrom}
                  onChange={(e) =>
                    setDraft({ ...draft, timesheetsFrom: e.target.value })
                  }
                  className="h-8 w-[10.5rem]"
                />
              </Field>
            </>
          )}
        </div>
      </PaneSection>

      <PaneSection label="Links">
        {draft.links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. A link called &ldquo;Timesheet&rdquo; comes first on every
            &ldquo;Submit hours&rdquo; task.
          </p>
        ) : (
          <ul className="space-y-1">
            {draft.links.map((l) => (
              <li
                key={l.key}
                className="grid grid-cols-[8rem_minmax(0,1fr)_1.5rem] items-center gap-1"
              >
                <Input
                  aria-label="Label"
                  value={l.label}
                  placeholder="Handbook"
                  onChange={(e) => setLink(l.key, { label: e.target.value })}
                  className="h-8"
                  autoComplete="off"
                />
                <Input
                  aria-label="Address"
                  value={l.url}
                  placeholder="https://"
                  inputMode="url"
                  onChange={(e) => setLink(l.key, { url: e.target.value })}
                  className="h-8"
                  autoComplete="off"
                />
                <button
                  type="button"
                  aria-label="Remove this link"
                  title="Remove this link"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      links: draft.links.filter((x) => x.key !== l.key),
                    })
                  }
                  className="h-8 text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button variant="quiet" onClick={addLink}>
            Add a link
          </Button>
        </div>
      </PaneSection>

      <PaneSection label="Notes">
        <Textarea
          aria-label="Notes"
          value={draft.notes}
          rows={3}
          placeholder="Swap shifts through the group chat, two days' notice"
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {job ? (
            <Button
              variant="secondary"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              Save changes
            </Button>
          ) : (
            <>
              <Button disabled={saving} onClick={() => void save()}>
                Add
              </Button>
              <Button variant="quiet" onClick={() => select(null)}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </PaneSection>

      {job ? (
        <>
          <PaneSection label={job.archived ? "Archived" : "Archive"}>
            <p className="text-sm text-muted-foreground">
              {job.archived
                ? "Archived jobs keep their shifts and contacts, and stay out of Shifts, Hours and Contacts."
                : "Archiving keeps its shifts and contacts, and takes it out of Shifts, Hours and Contacts."}
            </p>
            <Button
              variant="quiet"
              onClick={async () => {
                if (!(await updateJob(job.id, { archived: !job.archived }))) {
                  toast.error("Couldn't change that. Try again.");
                }
              }}
            >
              {job.archived ? "Restore" : "Archive"}
            </Button>
          </PaneSection>
          <PaneSection label="Delete">
            <p className="text-sm text-muted-foreground">
              Deletes the job,{" "}
              {job.shiftCount === 1
                ? "its 1 shift"
                : `its ${job.shiftCount} shifts`}{" "}
              and its contacts. This can&apos;t be undone; archive it to keep
              them.
            </p>
            <DeleteButton
              onDelete={async () => {
                if (!(await deleteJob(job.id))) {
                  toast.error("Couldn't delete it. Try again.");
                }
              }}
            />
          </PaneSection>
        </>
      ) : null}
    </div>
  );
}
