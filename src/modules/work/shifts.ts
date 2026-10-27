/**
 * Shifts as the Work page changes them. A shift added by hand (a pickup, a
 * job with no schedule import) changes in every way and can be deleted. An
 * imported one keeps its schedule (src/modules/work/imports.ts); here it can
 * only be dropped or restored, given the times it was really worked, and a
 * note. Every change goes onto the calendar and into the period's timesheet
 * task.
 */
import type { Shift } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { type Db as Client, type DbTransaction, prisma } from "@/lib/prisma";

import {
  ensureJobFeed,
  projectShift,
  unprojectShift,
} from "@/modules/work/feed";
import { toShiftRow, workSettings } from "@/modules/work/rows";
import { reconcileTimesheets } from "@/modules/work/timesheet";
import type { NextShift, ShiftRow } from "@/modules/work/types";

type Db = Client | DbTransaction;

/** How far ahead the top bar looks for the next shift. */
const NEXT_WITHIN_MS = 36 * 3600 * 1000;

export interface HandShift {
  title: string;
  start: Date;
  end: Date;
  location?: string | null;
  role?: string | null;
  supervisor?: string | null;
  note?: string | null;
}

export interface ShiftChange extends Partial<HandShift> {
  dropped?: boolean;
  workedStart?: Date | null;
  workedEnd?: Date | null;
}

/** What only a hand-added shift may change: its schedule. */
const SCHEDULE_FIELDS = [
  "title",
  "start",
  "end",
  "location",
  "role",
  "supervisor",
] as const;

/** Rows for some shifts, each with its job's contacts. */
async function rowsFor(
  db: Db,
  userId: string,
  shifts: Shift[]
): Promise<ShiftRow[]> {
  if (shifts.length === 0) return [];
  const jobIds = [...new Set(shifts.map((s) => s.jobId))];
  const [contacts, { timeZone }] = await Promise.all([
    db.jobContact.findMany({
      where: { jobId: { in: jobIds } },
      orderBy: { position: "asc" },
    }),
    workSettings(db, userId),
  ]);
  const now = newDate();
  return shifts.map((s) =>
    toShiftRow(
      s,
      contacts.filter((c) => c.jobId === s.jobId),
      timeZone,
      now
    )
  );
}

/** Shifts overlapping [from, to), soonest first, dropped ones included. */
export async function listShiftRows(
  userId: string,
  from: Date,
  to: Date,
  jobId?: string
): Promise<ShiftRow[]> {
  const shifts = await prisma.shift.findMany({
    where: {
      job: { userId },
      ...(jobId ? { jobId } : {}),
      start: { lt: to },
      end: { gt: from },
    },
    orderBy: { start: "asc" },
  });
  return rowsFor(prisma, userId, shifts);
}

async function shiftRow(userId: string, shift: Shift): Promise<ShiftRow> {
  const [row] = await rowsFor(prisma, userId, [shift]);
  return row;
}

/** Adds a shift by hand. Null when there's no such job. */
export async function addShift(
  userId: string,
  jobId: string,
  input: HandShift
): Promise<ShiftRow | null> {
  const shift = await prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({ where: { id: jobId, userId } });
    if (!job) return null;
    const created = await tx.shift.create({ data: { ...input, jobId } });
    await projectShift(tx, await ensureJobFeed(tx, job), created);
    return created;
  });
  if (!shift) return null;
  await reconcileTimesheets(userId);
  return shiftRow(userId, shift);
}

export type ShiftEdit =
  | ShiftRow
  | "not_found"
  | "imported"
  | "ends_before_start";

/** Changes a shift (module comment for what an imported one takes). */
export async function editShift(
  userId: string,
  shiftId: string,
  change: ShiftChange
): Promise<ShiftEdit> {
  const result = await prisma.$transaction(
    async (tx): Promise<Shift | Exclude<ShiftEdit, ShiftRow>> => {
      const found = await tx.shift.findFirst({
        where: { id: shiftId, job: { userId } },
        include: { job: true },
      });
      if (!found) return "not_found";
      if (
        found.importKey !== null &&
        SCHEDULE_FIELDS.some((f) => change[f] !== undefined)
      )
        return "imported";
      const start = change.start ?? found.start;
      const end = change.end ?? found.end;
      const workedStart =
        change.workedStart === undefined
          ? found.workedStart
          : change.workedStart;
      const workedEnd =
        change.workedEnd === undefined ? found.workedEnd : change.workedEnd;
      if (end <= start || (workedEnd ?? end) <= (workedStart ?? start))
        return "ends_before_start";
      const { job, ...rest } = found;
      const updated = await tx.shift.update({
        where: { id: rest.id },
        data: change,
      });
      await projectShift(tx, await ensureJobFeed(tx, job), updated);
      return updated;
    }
  );
  if (typeof result === "string") return result;
  await reconcileTimesheets(userId);
  return shiftRow(userId, result);
}

/** Deletes a shift added by hand; an imported one can only be dropped. */
export async function deleteShift(
  userId: string,
  shiftId: string
): Promise<"deleted" | "not_found" | "imported"> {
  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.shift.findFirst({
      where: { id: shiftId, job: { userId } },
    });
    if (!found) return "not_found" as const;
    if (found.importKey !== null) return "imported" as const;
    await unprojectShift(tx, found);
    await tx.shift.delete({ where: { id: found.id } });
    return "deleted" as const;
  });
  if (result === "deleted") await reconcileTimesheets(userId);
  return result;
}

/** The shift on now, or the next one within a day and a half, across every job that isn't archived. */
export async function nextShift(userId: string): Promise<NextShift | null> {
  const now = newDate();
  const shift = await prisma.shift.findFirst({
    where: {
      job: { userId, archived: false },
      dropped: false,
      start: { lt: new Date(now.getTime() + NEXT_WITHIN_MS) },
      end: { gt: now },
    },
    orderBy: { start: "asc" },
    include: { job: { select: { name: true, color: true } } },
  });
  if (!shift) return null;
  const { job, ...rest } = shift;
  return {
    ...(await shiftRow(userId, rest)),
    jobName: job.name,
    color: job.color,
  };
}
