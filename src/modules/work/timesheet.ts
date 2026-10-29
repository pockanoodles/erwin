/**
 * The Work module's one task per pay period: "Submit hours", for a job with
 * a pay period, once a shift in that period has been worked and isn't on a
 * timesheet yet. It names the hours, lists the shifts to enter, and waits
 * (postponed) until the period's last day; it's due its job's lag after
 * that, at the end of the day.
 *
 * It closes from either side, like Training's workout task. Marking the
 * period submitted on the Work page finishes the task; finishing the task
 * anywhere else in Sigwald marks the period's worked shifts as on the
 * timesheet, by `reconcileTimesheets`, which the sync loop runs and the page
 * runs before it reads. A shift worked after that (one added late) opens the
 * period again with a new task for what's left.
 */
import type { Job, Shift } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

import {
  dayIn,
  endOfDayIn,
  newDate,
  shiftDay,
  startOfDayIn,
} from "@/lib/date-utils";
import { type Db as Client, type DbTransaction, prisma } from "@/lib/prisma";

import { tasksChanged } from "@/modules/hooks";
import {
  type DayRange,
  formatHours,
  hoursOf,
  isWorked,
  spanOf,
  sumHours,
} from "@/modules/work/hours";
import {
  type WorkSettings,
  dateDay,
  hasPayPeriod,
  payPeriodAt,
  readLinks,
  spanOfDays,
  workSettings,
} from "@/modules/work/rows";

type Db = Client | DbTransaction;

export const WORK_SOURCE = "WORK";

/** `Task.syncStatus` once a finished timesheet task's shifts are marked. */
const LOGGED = "logged";

/** A timesheet task's `externalTaskId`: its job and its period's first day. */
export const timesheetKey = (jobId: string, first: string) =>
  `${jobId}:${first}`;

export function parseTimesheetKey(
  key: string | null
): { jobId: string; first: string } | null {
  const match = /^([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(key ?? "");
  return match ? { jobId: match[1], first: match[2] } : null;
}

const openTaskWhere = (userId: string) => ({
  userId,
  source: WORK_SOURCE,
  parentTaskId: null,
  status: { not: "completed" },
});

/** Finished timesheet tasks whose shifts aren't marked yet. */
const tickedTaskWhere = (userId: string) => ({
  userId,
  source: WORK_SOURCE,
  status: "completed",
  OR: [{ syncStatus: null }, { syncStatus: { not: LOGGED } }],
});

type TimesheetJob = Pick<
  Job,
  | "id"
  | "name"
  | "payPeriodDays"
  | "payPeriodStart"
  | "timesheetDueDays"
  | "timesheetsFrom"
  | "links"
>;

/** A period of a job by its first day. */
const periodFrom = (
  job: TimesheetJob & { payPeriodDays: number },
  first: string
): DayRange => ({
  first,
  last: shiftDay(first, job.payPeriodDays - 1),
});

/** One line of the task's description: "Tue Oct 27, 8:45 PM–12:15 AM · 5v5 Basketball · 3.5 h". */
function shiftLine(s: Shift, settings: WorkSettings): string {
  const clock = settings.timeFormat === "24h" ? "HH:mm" : "h:mm a";
  const { start, end } = spanOf(s);
  const from = formatInTimeZone(
    start,
    settings.timeZone,
    `EEE MMM d, ${clock}`
  );
  const to = formatInTimeZone(end, settings.timeZone, clock);
  return `- ${from}–${to} · ${s.title} · ${formatHours(hoursOf(s))} h`;
}

/** What the task for a period says and when it's due. */
function taskFields(
  job: TimesheetJob,
  period: DayRange,
  shifts: Shift[],
  settings: WorkSettings,
  now: Date
) {
  const hours = sumHours(shifts);
  const sorted = [...shifts].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const link = readLinks(job.links).find((l) =>
    /time ?sheet|hours|workday/i.test(`${l.label} ${l.url}`)
  );
  const showAt = startOfDayIn(period.last, settings.timeZone);
  const count = sorted.length === 1 ? "1 shift" : `${sorted.length} shifts`;
  return {
    title: `Submit hours: ${job.name}, ${formatHours(hours)} h`,
    description: [
      `${count}, ${formatHours(hours)} h, for the pay period ${period.first} to ${period.last}:`,
      ...sorted.map((s) => shiftLine(s, settings)),
      ...(link ? ["", `Timesheet: ${link.url}`] : []),
    ].join("\n"),
    dueDate: endOfDayIn(
      shiftDay(period.last, job.timesheetDueDays),
      settings.timeZone
    ),
    postponedUntil: showAt > now ? showAt : null,
    duration: Math.min(10 + sorted.length * 2, 30),
  };
}

/**
 * A job's worked shifts that aren't on a timesheet, by the first day of
 * their period. Periods before the job's `timesheetsFrom` are left out.
 */
async function unloggedByPeriod(
  db: Db,
  job: TimesheetJob,
  timeZone: string,
  now: Date
) {
  const byPeriod = new Map<string, Shift[]>();
  if (!hasPayPeriod(job)) return byPeriod;
  const from = dateDay(job.timesheetsFrom);
  const shifts = await db.shift.findMany({
    where: {
      jobId: job.id,
      dropped: false,
      loggedAt: null,
      start: {
        lt: now,
        ...(from ? { gte: startOfDayIn(from, timeZone) } : {}),
      },
    },
  });
  for (const s of shifts) {
    if (!isWorked(s, now)) continue;
    const { first } = payPeriodAt(job, dayIn(s.start, timeZone))!;
    if (from && first < from) continue;
    byPeriod.set(first, [...(byPeriod.get(first) ?? []), s]);
  }
  return byPeriod;
}

const sameTime = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * Makes someone's open timesheet tasks match their unsubmitted hours: one per
 * period that has some, created, brought up to date (only when something
 * changed, since the sync loop runs this every tick), or removed. Returns the
 * ids of tasks it created, so the caller can apply goal rules to them.
 */
export async function syncTimesheetTasks(
  db: Db,
  userId: string,
  now: Date = newDate()
): Promise<string[]> {
  const [settings, jobs, open] = await Promise.all([
    workSettings(db, userId),
    db.job.findMany({
      where: {
        userId,
        payPeriodDays: { not: null },
        payPeriodStart: { not: null },
      },
    }),
    db.task.findMany({ where: openTaskWhere(userId) }),
  ]);
  const wanted = new Map<string, ReturnType<typeof taskFields>>();
  for (const job of jobs) {
    if (!hasPayPeriod(job)) continue;
    for (const [first, shifts] of await unloggedByPeriod(
      db,
      job,
      settings.timeZone,
      now
    )) {
      wanted.set(
        timesheetKey(job.id, first),
        taskFields(job, periodFrom(job, first), shifts, settings, now)
      );
    }
  }

  for (const task of open) {
    const fields = task.externalTaskId
      ? wanted.get(task.externalTaskId)
      : undefined;
    if (!fields) {
      await db.task.deleteMany({ where: { id: task.id } });
      continue;
    }
    wanted.delete(task.externalTaskId!);
    const changed =
      task.title !== fields.title ||
      task.description !== fields.description ||
      task.duration !== fields.duration ||
      !sameTime(task.dueDate, fields.dueDate) ||
      !sameTime(task.postponedUntil, fields.postponedUntil);
    if (changed) await db.task.update({ where: { id: task.id }, data: fields });
  }

  const created: string[] = [];
  for (const [key, fields] of wanted) {
    const task = await db.task.create({
      data: {
        ...fields,
        userId,
        status: "todo",
        source: WORK_SOURCE,
        externalTaskId: key,
        priority: "medium",
        category: "WORK",
        // Task sync to Google/Outlook never takes these.
        skipSync: true,
      },
      select: { id: true },
    });
    created.push(task.id);
  }
  return created;
}

/** Marks a period's worked shifts as on the timesheet, as of `at`. */
async function markLogged(
  db: Db,
  job: TimesheetJob,
  first: string,
  at: Date,
  timeZone: string
) {
  if (!hasPayPeriod(job)) return 0;
  const shifts = await db.shift.findMany({
    where: {
      jobId: job.id,
      dropped: false,
      loggedAt: null,
      start: spanOfDays(periodFrom(job, first), timeZone),
    },
  });
  const ids = shifts.filter((s) => isWorked(s, at)).map((s) => s.id);
  if (ids.length === 0) return 0;
  const { count } = await db.shift.updateMany({
    where: { id: { in: ids } },
    data: { loggedAt: at },
  });
  return count;
}

/**
 * Timesheet tasks finished outside the Work page mark their period's worked
 * shifts as submitted, and every period's task is brought up to date. Run by
 * the sync loop for everyone with Work on, and by the page before it reads;
 * cheap when there's nothing to change.
 */
export async function reconcileTimesheets(userId: string): Promise<number> {
  const now = newDate();
  const finished = await prisma.task.findMany({
    where: tickedTaskWhere(userId),
    select: { id: true, externalTaskId: true, completedAt: true },
  });
  if (finished.length > 0) {
    const { timeZone } = await workSettings(prisma, userId);
    for (const task of finished) {
      await prisma.$transaction(async (tx) => {
        // Claim the task first: of two passes that saw it at once (the page
        // asks for several lists together), only one gets to mark it.
        const claimed = await tx.task.updateMany({
          where: { ...tickedTaskWhere(userId), id: task.id },
          data: { syncStatus: LOGGED },
        });
        if (claimed.count === 0) return;
        const key = parseTimesheetKey(task.externalTaskId);
        const job = key
          ? await tx.job.findFirst({ where: { id: key.jobId, userId } })
          : null;
        if (job && key)
          await markLogged(
            tx,
            job,
            key.first,
            task.completedAt ?? now,
            timeZone
          );
      });
    }
  }
  const created = await prisma.$transaction(async (tx) => {
    // One pass at a time per person: the page asks for several lists at
    // once, and each pass would otherwise create the same period's task.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`work.timesheets:${userId}`}))`;
    return syncTimesheetTasks(tx, userId, now);
  });
  if (created.length > 0) await tasksChanged(prisma, userId, created);
  return finished.length;
}

/**
 * Marks a period submitted from the Work page: its worked shifts go on the
 * timesheet and its open task is finished (and earns its XP). False when
 * there's no such job or it has no pay period.
 */
export async function submitPeriod(
  userId: string,
  jobId: string,
  first: string
): Promise<boolean> {
  const now = newDate();
  const done = await prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({ where: { id: jobId, userId } });
    if (!job || !hasPayPeriod(job)) return false;
    const { timeZone } = await workSettings(tx, userId);
    await markLogged(tx, job, first, now, timeZone);
    await tx.task.updateMany({
      where: {
        ...openTaskWhere(userId),
        externalTaskId: timesheetKey(jobId, first),
      },
      data: { status: "completed", completedAt: now, syncStatus: LOGGED },
    });
    return true;
  });
  if (done) await reconcileTimesheets(userId);
  return done;
}

/**
 * Takes a period's hours back off the timesheet (marked submitted by
 * mistake); its task comes back. False when there's no such job.
 */
export async function reopenPeriod(
  userId: string,
  jobId: string,
  first: string
): Promise<boolean> {
  const done = await prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({ where: { id: jobId, userId } });
    if (!job || !hasPayPeriod(job)) return false;
    const { timeZone } = await workSettings(tx, userId);
    await tx.shift.updateMany({
      where: { jobId, start: spanOfDays(periodFrom(job, first), timeZone) },
      data: { loggedAt: null },
    });
    return true;
  });
  if (done) await reconcileTimesheets(userId);
  return done;
}
