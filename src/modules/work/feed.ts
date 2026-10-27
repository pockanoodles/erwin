/**
 * A job's shifts on the calendar. Each job has one LOCAL feed of its own
 * (no account, so no calendar sync ever touches it), and each shift that
 * isn't dropped has one event in it, kept as the shift ran: worked times
 * where they were changed. The Shift row is the truth; the event is a copy
 * the calendar, availability and the scheduler read, so an event deleted
 * from the calendar comes back (`restoreShiftEvents`): a shift leaves the
 * calendar by being dropped on the Work page.
 */
import type { Job, Shift } from "@prisma/client";

import { type Db as Client, type DbTransaction, prisma } from "@/lib/prisma";

import { spanOf } from "@/modules/work/hours";

type Db = Client | DbTransaction;

type FeedJob = Pick<
  Job,
  "id" | "userId" | "name" | "color" | "feedId" | "archived"
>;

/** The job's feed, made if it has none (or its feed was deleted from the calendar). */
export async function ensureJobFeed(db: Db, job: FeedJob): Promise<string> {
  if (job.feedId) {
    const feed = await db.calendarFeed.findUnique({
      where: { id: job.feedId },
      select: { id: true },
    });
    if (feed) return feed.id;
  }
  const feed = await db.calendarFeed.create({
    data: {
      userId: job.userId,
      type: "LOCAL",
      url: `work:${job.id}`,
      name: job.name,
      color: job.color,
      enabled: !job.archived,
    },
  });
  await db.job.update({ where: { id: job.id }, data: { feedId: feed.id } });
  return feed.id;
}

/** Keeps the feed's name, colour and visibility on the job's. */
export async function syncJobFeed(db: Db, job: FeedJob): Promise<void> {
  const feedId = await ensureJobFeed(db, job);
  await db.calendarFeed.update({
    where: { id: feedId },
    data: { name: job.name, color: job.color, enabled: !job.archived },
  });
}

/** Puts a shift on the calendar as it stands, or takes it off once dropped. */
export async function projectShift(
  db: Db,
  feedId: string,
  shift: Shift
): Promise<void> {
  if (shift.dropped) {
    await unprojectShift(db, shift);
    return;
  }
  const { start, end } = spanOf(shift);
  const data = {
    title: shift.title,
    description: shift.details,
    location: shift.location,
    start,
    end,
    status: "confirmed",
    transparency: "OPAQUE",
  };
  if (shift.eventId) {
    const moved = await db.calendarEvent.updateMany({
      where: { id: shift.eventId, feedId },
      data,
    });
    if (moved.count > 0) return;
  }
  const event = await db.calendarEvent.create({
    data: { ...data, feedId, externalEventId: `work:${shift.id}` },
    select: { id: true },
  });
  await db.shift.update({
    where: { id: shift.id },
    data: { eventId: event.id },
  });
}

/** Takes a shift off the calendar. */
export async function unprojectShift(
  db: Db,
  shift: Pick<Shift, "id" | "eventId">
): Promise<void> {
  if (!shift.eventId) return;
  await db.calendarEvent.deleteMany({ where: { id: shift.eventId } });
  await db.shift.updateMany({
    where: { id: shift.id },
    data: { eventId: null },
  });
}

/**
 * Puts back on the calendar every shift that isn't dropped but has lost its
 * event (deleted from the calendar, or its feed deleted). Run by the sync
 * loop for everyone with Work on; one query when there's nothing to do.
 */
export async function restoreShiftEvents(userId: string): Promise<number> {
  const lost = await prisma.shift.findMany({
    where: { job: { userId }, dropped: false, eventId: null },
    select: { id: true },
  });
  let restored = 0;
  for (const { id } of lost) {
    restored += await prisma.$transaction(async (tx) => {
      // Claim the row first: it locks the shift until this commits, so a
      // drop made meanwhile either lands before (and this skips it) or
      // after (and takes the event off again).
      const claimed = await tx.shift.updateMany({
        where: { id, dropped: false, eventId: null },
        data: { updatedAt: new Date() },
      });
      if (claimed.count === 0) return 0;
      // Read the job afresh: an earlier pass may have just made its feed.
      const { job, ...shift } = await tx.shift.findUniqueOrThrow({
        where: { id },
        include: { job: true },
      });
      await projectShift(tx, await ensureJobFeed(tx, job), shift);
      return 1;
    });
  }
  return restored;
}
