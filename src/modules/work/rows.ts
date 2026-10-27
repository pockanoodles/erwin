/**
 * The Work module's tables as the API sends them (src/modules/work/types.ts):
 * a job with its week, pay period and next shift; a shift with its hours and
 * its supervisor's contact; a pay period's sums.
 */
import type { Job, JobContact, Prisma, Shift } from "@prisma/client";

import {
  dayIn,
  endOfDayIn,
  newDate,
  shiftDay,
  startOfDayIn,
} from "@/lib/date-utils";
import type { Db as Client, DbTransaction } from "@/lib/prisma";

import { contactFor } from "@/modules/work/contacts";
import {
  type DayRange,
  earningsFor,
  hoursOf,
  isWorked,
  periodOf,
  sumHours,
  weekOf,
} from "@/modules/work/hours";
import type {
  ContactRow,
  JobLink,
  JobRow,
  PeriodRow,
  ShiftRow,
} from "@/modules/work/types";

type Db = Client | DbTransaction;

/** What the module needs of someone's Settings. */
export interface WorkSettings {
  timeZone: string;
  weekStartDay: string;
  timeFormat: string;
}

export async function workSettings(
  db: Db,
  userId: string
): Promise<WorkSettings> {
  const s = await db.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true, weekStartDay: true, timeFormat: true },
  });
  return {
    timeZone: s?.timeZone || "UTC",
    weekStartDay: s?.weekStartDay ?? "sunday",
    timeFormat: s?.timeFormat ?? "12h",
  };
}

/** A @db.Date column as its day. Prisma hands those back at UTC midnight. */
export const dateDay = (d: Date | null): string | null =>
  d?.toISOString().slice(0, 10) ?? null;

/** A day as a @db.Date column takes it. */
export const dayDate = (day: string | null): Date | null =>
  day ? new Date(`${day}T00:00:00Z`) : null;

/** Its links as stored. Anything malformed in them is dropped, not thrown. */
export function readLinks(raw: Prisma.JsonValue): JobLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { label, url } = item as Record<string, unknown>;
    if (typeof url !== "string" || !url.trim()) return [];
    return [
      {
        label:
          typeof label === "string" && label.trim() ? label.trim() : url.trim(),
        url: url.trim(),
      },
    ];
  });
}

type PeriodJob = Pick<Job, "payPeriodDays" | "payPeriodStart">;

/** A job with a pay period set, which is what timesheets need. */
export function hasPayPeriod(
  job: PeriodJob
): job is PeriodJob & { payPeriodDays: number; payPeriodStart: Date } {
  return job.payPeriodDays !== null && job.payPeriodStart !== null;
}

/** The pay period a day falls in at a job, or null without a pay period. */
export function payPeriodAt(job: PeriodJob, day: string): DayRange | null {
  if (!hasPayPeriod(job)) return null;
  return periodOf(day, dateDay(job.payPeriodStart)!, job.payPeriodDays);
}

/** The moments a run of days covers: from the first's start to the day after the last. */
export function spanOfDays(
  range: DayRange,
  timeZone: string
): { gte: Date; lt: Date } {
  return {
    gte: startOfDayIn(range.first, timeZone),
    lt: startOfDayIn(shiftDay(range.last, 1), timeZone),
  };
}

export function toContactRow(c: JobContact): ContactRow {
  return {
    id: c.id,
    jobId: c.jobId,
    name: c.name,
    role: c.role,
    phone: c.phone,
    email: c.email,
    notes: c.notes,
    imported: c.importKey !== null,
  };
}

export function toShiftRow(
  s: Shift,
  contacts: readonly JobContact[],
  timeZone: string,
  now: Date = newDate()
): ShiftRow {
  const contact = contactFor(s.supervisor, contacts);
  return {
    id: s.id,
    jobId: s.jobId,
    title: s.title,
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    workedStart: s.workedStart?.toISOString() ?? null,
    workedEnd: s.workedEnd?.toISOString() ?? null,
    day: dayIn(s.start, timeZone),
    location: s.location,
    role: s.role,
    supervisor: s.supervisor,
    details: s.details,
    dropped: s.dropped,
    note: s.note,
    loggedAt: s.loggedAt?.toISOString() ?? null,
    byHand: s.importKey === null,
    hours: hoursOf(s),
    worked: isWorked(s, now),
    contact: contact ? toContactRow(contact) : null,
  };
}

type RowJob = Pick<
  Job,
  | "id"
  | "hourlyRate"
  | "timesheetDueDays"
  | "payPeriodDays"
  | "payPeriodStart"
  | "timesheetsFrom"
>;

/**
 * A pay period's sums from the shifts that start in it. One from before the
 * job's `timesheetsFrom` has nothing left to submit: its hours were handled
 * before Erwin tracked them.
 */
export function toPeriodRow(
  job: RowJob,
  period: DayRange,
  shifts: readonly Shift[],
  timeZone: string,
  taskId: string | null,
  now: Date = newDate()
): PeriodRow {
  const worked = shifts.filter((s) => isWorked(s, now));
  const hours = sumHours(worked);
  const from = dateDay(job.timesheetsFrom);
  const handled = from !== null && period.first < from;
  const unlogged = handled
    ? 0
    : worked.filter((s) => s.loggedAt === null).length;
  const today = dayIn(now, timeZone);
  return {
    jobId: job.id,
    first: period.first,
    last: period.last,
    dueBy: endOfDayIn(
      shiftDay(period.last, job.timesheetDueDays),
      timeZone
    ).toISOString(),
    hours,
    scheduledHours: sumHours(shifts.filter((s) => !s.dropped)),
    earnings: earningsFor(hours, job.hourlyRate),
    shifts: worked.length,
    unlogged,
    submitted: worked.length > 0 && unlogged === 0,
    tracked: !handled,
    current: today >= period.first && today <= period.last,
    taskId,
  };
}

/** The open "Submit hours" task per period, keyed "<job id>:<first day>". */
export async function openTimesheetTasks(
  db: Db,
  userId: string
): Promise<Map<string, string>> {
  const tasks = await db.task.findMany({
    where: {
      userId,
      source: "WORK",
      parentTaskId: null,
      status: { not: "completed" },
    },
    select: { id: true, externalTaskId: true },
  });
  return new Map(
    tasks.flatMap((t) =>
      t.externalTaskId ? [[t.externalTaskId, t.id] as const] : []
    )
  );
}

const jobInclude = {
  contacts: { orderBy: [{ position: "asc" }, { name: "asc" }] },
  _count: { select: { shifts: true } },
} satisfies Prisma.JobInclude;

type FullJob = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

async function toJobRow(
  db: Db,
  job: FullJob,
  settings: WorkSettings,
  tasks: Map<string, string>,
  now: Date
): Promise<JobRow> {
  const { timeZone } = settings;
  const today = dayIn(now, timeZone);
  const week = weekOf(today, settings.weekStartDay);
  const period = payPeriodAt(job, today);
  const weekSpan = spanOfDays(week, timeZone);
  const periodSpan = period ? spanOfDays(period, timeZone) : weekSpan;
  const [around, next] = await Promise.all([
    db.shift.findMany({
      where: {
        jobId: job.id,
        start: {
          gte: new Date(
            Math.min(weekSpan.gte.getTime(), periodSpan.gte.getTime())
          ),
          lt: new Date(
            Math.max(weekSpan.lt.getTime(), periodSpan.lt.getTime())
          ),
        },
      },
    }),
    db.shift.findFirst({
      where: { jobId: job.id, dropped: false, end: { gt: now } },
      orderBy: { start: "asc" },
    }),
  ]);
  const inSpan = (span: { gte: Date; lt: Date }) =>
    around.filter((s) => s.start >= span.gte && s.start < span.lt);
  const thisWeek = inSpan(weekSpan).filter((s) => !s.dropped);
  return {
    id: job.id,
    name: job.name,
    color: job.color,
    hourlyRate: job.hourlyRate,
    currency: job.currency,
    payPeriodDays: job.payPeriodDays,
    payPeriodStart: dateDay(job.payPeriodStart),
    timesheetDueDays: job.timesheetDueDays,
    timesheetsFrom: dateDay(job.timesheetsFrom),
    weeklyCapHours: job.weeklyCapHours,
    links: readLinks(job.links),
    notes: job.notes,
    importKey: job.importKey,
    archived: job.archived,
    createdAt: job.createdAt.toISOString(),
    week: {
      ...week,
      hours: sumHours(thisWeek),
      workedHours: sumHours(thisWeek.filter((s) => isWorked(s, now))),
    },
    period: period
      ? toPeriodRow(
          job,
          period,
          inSpan(periodSpan),
          timeZone,
          tasks.get(`${job.id}:${period.first}`) ?? null,
          now
        )
      : null,
    nextShift: next ? toShiftRow(next, job.contacts, timeZone, now) : null,
    shiftCount: job._count.shifts,
  };
}

/** Someone's jobs (or the archived ones), by name. */
export async function jobRows(
  db: Db,
  userId: string,
  archived: boolean
): Promise<JobRow[]> {
  const now = newDate();
  const [jobs, settings, tasks] = await Promise.all([
    db.job.findMany({
      where: { userId, archived },
      include: jobInclude,
      orderBy: { name: "asc" },
    }),
    workSettings(db, userId),
    openTimesheetTasks(db, userId),
  ]);
  return Promise.all(jobs.map((j) => toJobRow(db, j, settings, tasks, now)));
}

export async function jobRow(
  db: Db,
  userId: string,
  id: string
): Promise<JobRow | null> {
  const [job, settings, tasks] = await Promise.all([
    db.job.findFirst({ where: { id, userId }, include: jobInclude }),
    workSettings(db, userId),
    openTimesheetTasks(db, userId),
  ]);
  return job ? toJobRow(db, job, settings, tasks, newDate()) : null;
}

/**
 * A job's pay periods, newest first: today's, and every earlier one with a
 * shift in it, back to `limit` periods.
 */
export async function periodRows(
  db: Db,
  userId: string,
  jobId: string,
  limit = 26
): Promise<PeriodRow[] | null> {
  const job = await db.job.findFirst({ where: { id: jobId, userId } });
  if (!job) return null;
  if (!hasPayPeriod(job)) return [];
  const now = newDate();
  const [settings, tasks] = await Promise.all([
    workSettings(db, userId),
    openTimesheetTasks(db, userId),
  ]);
  const { timeZone } = settings;
  const current = payPeriodAt(job, dayIn(now, timeZone))!;
  const oldest = shiftDay(current.first, -job.payPeriodDays * (limit - 1));
  const shifts = await db.shift.findMany({
    where: {
      jobId,
      start: spanOfDays({ first: oldest, last: current.last }, timeZone),
    },
    orderBy: { start: "asc" },
  });
  const byPeriod = new Map<string, Shift[]>([[current.first, []]]);
  for (const s of shifts) {
    const { first } = payPeriodAt(job, dayIn(s.start, timeZone))!;
    byPeriod.set(first, [...(byPeriod.get(first) ?? []), s]);
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([first, list]) =>
      toPeriodRow(
        job,
        { first, last: shiftDay(first, job.payPeriodDays - 1) },
        list,
        timeZone,
        tasks.get(`${jobId}:${first}`) ?? null,
        now
      )
    );
}
