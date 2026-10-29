"use client";

import { toast } from "sonner";

import {
  BAND,
  HEAD,
  ROW,
  Tag,
  cellClass,
  gutterClass,
  titleCellClass,
} from "@/components/sheet/sheet";

import { shiftDay } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { periodDue } from "@/modules/work/components/PeriodPane";
import { ShiftStatus } from "@/modules/work/components/ShiftPane";
import {
  JobDot,
  LINK,
  dayText,
  dialable,
  hoursText,
  momentDayText,
  moneyText,
  rangeText,
  spanText,
} from "@/modules/work/components/parts";
import { formatHours } from "@/modules/work/hours";
import { type WorkView, periodKey, useWorkStore } from "@/modules/work/store";
import type {
  ContactRow,
  JobRow,
  PeriodRow,
  ShiftRow,
} from "@/modules/work/types";

import type { TimeFormat } from "@/types/settings";

/**
 * The Work page's datasheets: each view's columns, how its rows and bands
 * are laid out (the lines), and the cells of each kind of row.
 */

export type Column = {
  label: string;
  width: number | undefined;
  right?: boolean;
};

const SHIFT_COLUMNS: Column[] = [
  { label: "#", width: 44, right: true },
  { label: "Day", width: 96 },
  { label: "Time", width: 160 },
  { label: "Hours", width: 52, right: true },
  { label: "Status", width: 96 },
  { label: "Title", width: undefined },
  { label: "Place", width: 128 },
  { label: "Role", width: 72 },
];

const PERIOD_COLUMNS: Column[] = [
  { label: "#", width: 44, right: true },
  { label: "Period", width: 150 },
  { label: "Shifts", width: 56, right: true },
  { label: "Hours", width: 56, right: true },
  { label: "Est. pay", width: 88, right: true },
  { label: "Due", width: 100 },
  { label: "Submitted", width: undefined },
];

const CONTACT_COLUMNS: Column[] = [
  { label: "#", width: 44, right: true },
  { label: "Name", width: 160 },
  { label: "Role", width: 128 },
  { label: "Phone", width: 128 },
  { label: "Email", width: 176 },
  { label: "Notes", width: undefined },
  { label: "From", width: 72 },
];

const JOB_COLUMNS: Column[] = [
  { label: "#", width: 44, right: true },
  { label: "Job", width: undefined },
  { label: "Pay", width: 88, right: true },
  { label: "Pay period", width: 104 },
  { label: "Cap", width: 56, right: true },
  { label: "This week", width: 72, right: true },
  { label: "Shifts", width: 56, right: true },
  { label: "Source", width: 80 },
];

/** Each view's columns, the row gutter first. */
export const COLUMNS: Record<WorkView, Column[]> = {
  shifts: SHIFT_COLUMNS,
  hours: PERIOD_COLUMNS,
  contacts: CONTACT_COLUMNS,
  jobs: JOB_COLUMNS,
};

/** A band (a section, a week, a job) or a row the selection can land on. */
export type Line<T> =
  | {
      key: string;
      id: null;
      band: "section" | "group" | "note";
      label: string;
      meta?: string;
      job?: JobRow;
    }
  | { key: string; id: string; row: T };

const band = <T,>(
  key: string,
  kind: "section" | "group" | "note",
  label: string,
  meta?: string,
  job?: JobRow
): Line<T> => ({ key, id: null, band: kind, label, meta, job });

const countText = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Upcoming shifts first, soonest first (the one on now among them); then
 * the ones that have ended under Worked, a band per week, newest week first
 * and each week in day order, the way a timesheet reads.
 */
export function shiftLines(
  shifts: ShiftRow[],
  now: Date,
  weekFirstOf: (day: string) => string
): Line<ShiftRow>[] {
  const over = (s: ShiftRow) => new Date(s.workedEnd ?? s.end) <= now;
  const upcoming = shifts.filter((s) => !over(s));
  const past = shifts.filter(over);
  const lines: Line<ShiftRow>[] = [
    band(
      "upcoming",
      "section",
      "Upcoming",
      upcoming.length > 0
        ? countText(upcoming.length, "shift", "shifts")
        : "nothing scheduled"
    ),
    ...upcoming.map((s) => ({ key: s.id, id: s.id, row: s })),
  ];
  if (past.length === 0) return lines;
  lines.push(band("worked", "section", "Worked"));
  const weeks = new Map<string, ShiftRow[]>();
  for (const s of past) {
    const first = weekFirstOf(s.day);
    weeks.set(first, [...(weeks.get(first) ?? []), s]);
  }
  for (const [first, list] of [...weeks].sort(([a], [b]) =>
    b.localeCompare(a)
  )) {
    const worked = list.filter((s) => s.worked);
    lines.push(
      band(
        `week:${first}`,
        "group",
        rangeText(first, shiftDay(first, 6)),
        `${hoursText(worked.reduce((sum, s) => sum + s.hours, 0))} · ${countText(worked.length, "shift", "shifts")}`
      )
    );
    for (const s of [...list].sort((a, b) => a.start.localeCompare(b.start))) {
      lines.push({ key: s.id, id: s.id, row: s });
    }
  }
  return lines;
}

export const periodName = (days: number | null) =>
  days === 7 ? "Weekly" : days === 14 ? "Every 2 weeks" : "";

/** Each job's pay periods under its band, the one today falls in first. */
export function periodLines(
  jobs: JobRow[],
  periods: Record<string, PeriodRow[]>
): Line<{ job: JobRow; period: PeriodRow }>[] {
  return jobs.flatMap((job) => {
    const rate =
      job.hourlyRate !== null
        ? `${moneyText(job.hourlyRate, job.currency)}/h`
        : null;
    const head = band<{ job: JobRow; period: PeriodRow }>(
      `job:${job.id}`,
      "section",
      job.name,
      [periodName(job.payPeriodDays), rate].filter(Boolean).join(" · "),
      job
    );
    if (job.payPeriodDays === null) {
      return [head, band(`none:${job.id}`, "note", "", undefined, job)];
    }
    const list = [...(periods[job.id] ?? [])].sort(
      (a, b) => Number(b.current) - Number(a.current)
    );
    return [
      head,
      ...list.map((period) => ({
        key: periodKey(period),
        id: periodKey(period),
        row: { job, period },
      })),
    ];
  });
}

/** Each job's contacts under its band. */
export function contactLines(
  jobs: JobRow[],
  contacts: Record<string, ContactRow[]>
): Line<{ job: JobRow; contact: ContactRow }>[] {
  return jobs.flatMap((job) => {
    const list = contacts[job.id] ?? [];
    return [
      band<{ job: JobRow; contact: ContactRow }>(
        `job:${job.id}`,
        "section",
        job.name,
        countText(list.length, "contact", "contacts"),
        job
      ),
      ...(list.length === 0
        ? [
            band<{ job: JobRow; contact: ContactRow }>(
              `none:${job.id}`,
              "note",
              "No contacts yet."
            ),
          ]
        : list.map((contact) => ({
            key: contact.id,
            id: contact.id,
            row: { job, contact },
          }))),
    ];
  });
}

/** The jobs worked now, then the archived under their own band. */
export function jobLines(jobs: JobRow[], archived: JobRow[]): Line<JobRow>[] {
  const rows = (list: JobRow[]) =>
    list.map((j) => ({ key: j.id, id: j.id, row: j }));
  return [
    ...rows(jobs),
    ...(archived.length > 0
      ? [
          band<JobRow>(
            "archived",
            "section",
            "Archived",
            countText(archived.length, "job", "jobs")
          ),
          ...rows(archived),
        ]
      : []),
  ];
}

export function Sheet({
  columns,
  children,
}: {
  columns: Column[];
  children: React.ReactNode;
}) {
  // Wide enough that the one flexible column keeps room to read; past
  // that the sheet scrolls sideways, as a spreadsheet does.
  const minWidth = columns.reduce((sum, c) => sum + (c.width ?? 160), 0);
  return (
    <table
      className="min-w-full table-fixed border-separate border-spacing-0 text-[13px]"
      style={{ minWidth }}
    >
      <colgroup>
        {columns.map((c) => (
          <col key={c.label} style={c.width ? { width: c.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.label}
              scope="col"
              className={cn(ROW, HEAD, c.right && "text-right")}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function SheetRow({
  index,
  active,
  onSelect,
  children,
}: {
  index: number;
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <tr
      onClick={onSelect}
      aria-selected={active}
      data-active-row={active || undefined}
      className="group cursor-default"
    >
      <td className={gutterClass(active)}>{index}</td>
      {children}
    </tr>
  );
}

/** A band spans every column after the gutter. */
const SPAN = (view: WorkView) => COLUMNS[view].length - 1;

export function BandRow({
  index,
  line,
  view,
  onSetUp,
}: {
  index: number;
  line: Extract<Line<unknown>, { id: null }>;
  view: WorkView;
  onSetUp: (jobId: string) => void;
}) {
  if (line.band === "note") {
    const job = line.job;
    return (
      <tr>
        <td className={gutterClass(false)}>{index}</td>
        <td
          colSpan={SPAN(view)}
          className={cn(
            ROW,
            "border-b border-border/60 px-2 align-middle text-muted-foreground"
          )}
        >
          {job ? (
            <span>
              No pay period yet, so there are no hours to add up.{" "}
              <button
                type="button"
                onClick={() => onSetUp(job.id)}
                className={LINK}
              >
                Set one up in Jobs
              </button>
            </span>
          ) : (
            line.label
          )}
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td className={gutterClass(false)}>{index}</td>
      <td
        colSpan={SPAN(view)}
        className={cn(BAND, line.band === "section" && "bg-muted")}
      >
        <span className="flex items-center gap-3 truncate">
          {line.band === "section" ? (
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wide text-foreground">
              {line.job ? <JobDot color={line.job.color} /> : null}
              {line.label}
            </span>
          ) : (
            <span className="truncate text-[12px] font-medium tabular-nums text-foreground">
              {line.label}
            </span>
          )}
          {line.meta ? (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {line.meta}
            </span>
          ) : null}
        </span>
      </td>
    </tr>
  );
}

export function ShiftCells({
  shift: s,
  job,
  now,
  format,
  active,
}: {
  shift: ShiftRow;
  job: JobRow | undefined;
  now: Date;
  format: TimeFormat;
  active: boolean;
}) {
  const cell = cellClass(active);
  const tone = s.dropped ? "text-muted-foreground" : "text-foreground";
  const changed = s.workedStart !== null || s.workedEnd !== null;
  return (
    <>
      <td className={cn(cell, "tabular-nums", tone)}>{dayText(s.day)}</td>
      <td
        className={cn(cell, "tabular-nums", tone)}
        title={
          changed
            ? `As worked. Scheduled ${spanText({ ...s, workedStart: null, workedEnd: null }, format)}`
            : undefined
        }
      >
        {spanText(s, format)}
        {changed ? <span className="text-muted-foreground"> *</span> : null}
      </td>
      <td
        className={cn(
          cell,
          "text-right tabular-nums",
          s.dropped ? "text-muted-foreground line-through" : "text-foreground"
        )}
      >
        {formatHours(s.hours)}
      </td>
      <td className={cell}>
        <ShiftStatus shift={s} now={now} />
      </td>
      <td
        className={cn(cell, titleCellClass(active), "font-medium", tone)}
        title={job?.name}
      >
        {job ? <JobDot color={job.color} /> : null} {s.title}
      </td>
      <td className={cn(cell, "text-muted-foreground")}>{s.location}</td>
      <td className={cn(cell, "text-muted-foreground")}>{s.role}</td>
    </>
  );
}

/** Where a period stands, and the one control that moves it on. */
function PeriodState({ job, period: p }: { job: JobRow; period: PeriodRow }) {
  const submitPeriod = useWorkStore((s) => s.submitPeriod);
  const reopenPeriod = useWorkStore((s) => s.reopenPeriod);
  if (p.shifts === 0) {
    return <span className="text-muted-foreground">Nothing worked</span>;
  }
  if (!p.tracked) {
    return <span className="text-muted-foreground">Before Sigwald</span>;
  }
  const late = p.unlogged > 0 && new Date(p.dueBy).getTime() < Date.now();
  const control = (label: string, act: () => Promise<PeriodRow | null>) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void act().then((done) => {
          if (!done) toast.error("Couldn't change that. Try again.");
        });
      }}
      className="er-brackets ml-auto h-5 flex-none px-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground"
    >
      {label}
    </button>
  );
  return (
    <span className="flex items-center gap-2">
      {p.submitted ? (
        <Tag tone="ok">Submitted</Tag>
      ) : late ? (
        <Tag tone="danger">Late</Tag>
      ) : p.current ? (
        <Tag>In progress</Tag>
      ) : (
        <Tag tone="warn">To submit</Tag>
      )}
      {p.submitted
        ? control("Reopen", () => reopenPeriod(job.id, p.first))
        : control("Submit", () => submitPeriod(job.id, p.first))}
    </span>
  );
}

export function PeriodCells({
  job,
  period: p,
  active,
}: {
  job: JobRow;
  period: PeriodRow;
  active: boolean;
}) {
  const cell = cellClass(active);
  const number = cn(cell, "text-right tabular-nums");
  const late = p.unlogged > 0 && new Date(p.dueBy).getTime() < Date.now();
  return (
    <>
      <td
        className={cn(
          cell,
          titleCellClass(active),
          "tabular-nums text-foreground",
          (p.current || periodDue(p)) && "font-medium"
        )}
      >
        {rangeText(p.first, p.last)}
        {p.current ? (
          <span className="font-normal text-muted-foreground"> · now</span>
        ) : null}
      </td>
      <td className={cn(number, "text-muted-foreground")}>{p.shifts}</td>
      <td className={cn(number, "text-foreground")}>{formatHours(p.hours)}</td>
      <td className={cn(number, "text-muted-foreground")}>
        {p.earnings !== null ? moneyText(p.earnings, job.currency) : ""}
      </td>
      <td
        className={cn(
          cell,
          "tabular-nums",
          late ? "font-medium text-destructive" : "text-muted-foreground"
        )}
      >
        {momentDayText(p.dueBy)}
      </td>
      <td className={cell}>
        <PeriodState job={job} period={p} />
      </td>
    </>
  );
}

export function ContactCells({
  contact: c,
  active,
}: {
  contact: ContactRow;
  active: boolean;
}) {
  const cell = cellClass(active);
  const phone = c.phone ? dialable(c.phone) : "";
  // A link in a cell opens the call or the email; the row still selects.
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <>
      <td
        className={cn(
          cell,
          titleCellClass(active),
          "font-medium text-foreground"
        )}
      >
        {c.name}
      </td>
      <td className={cn(cell, "text-muted-foreground")}>{c.role}</td>
      <td className={cn(cell, "tabular-nums")}>
        {phone ? (
          <a href={`tel:${phone}`} onClick={stop} className={LINK}>
            {c.phone}
          </a>
        ) : null}
      </td>
      <td className={cell}>
        {c.email ? (
          <a href={`mailto:${c.email}`} onClick={stop} className={LINK}>
            {c.email}
          </a>
        ) : null}
      </td>
      <td className={cn(cell, "text-muted-foreground")}>{c.notes}</td>
      <td className={cell}>{c.imported ? <Tag>Roster</Tag> : null}</td>
    </>
  );
}

export function JobCells({ job: j, active }: { job: JobRow; active: boolean }) {
  const cell = cellClass(active);
  const number = cn(cell, "text-right tabular-nums");
  const over = j.weeklyCapHours !== null && j.week.hours >= j.weeklyCapHours;
  return (
    <>
      <td
        className={cn(
          cell,
          titleCellClass(active),
          "font-medium",
          j.archived ? "text-muted-foreground" : "text-foreground"
        )}
      >
        <span className="flex items-center gap-1.5">
          <JobDot color={j.color} />
          <span className="truncate">{j.name}</span>
        </span>
      </td>
      <td className={cn(number, "text-foreground")}>
        {j.hourlyRate !== null
          ? `${moneyText(j.hourlyRate, j.currency)}/h`
          : ""}
      </td>
      <td className={cn(cell, "text-muted-foreground")}>
        {periodName(j.payPeriodDays)}
      </td>
      <td className={cn(number, "text-muted-foreground")}>
        {j.weeklyCapHours !== null ? `${formatHours(j.weeklyCapHours)} h` : ""}
      </td>
      <td
        className={cn(
          number,
          over ? "font-medium text-warning" : "text-muted-foreground"
        )}
      >
        {formatHours(j.week.hours)}
      </td>
      <td className={cn(number, "text-muted-foreground")}>{j.shiftCount}</td>
      <td className={cn(cell, "text-muted-foreground")}>
        {j.importKey ? `Import (${j.importKey})` : "By hand"}
      </td>
    </>
  );
}
