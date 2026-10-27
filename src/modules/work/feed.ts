/**
 * A job's shifts on the calendar. Each job has one LOCAL feed of its own
 * (no account, so no calendar sync ever touches it), and each shift that
 * isn't dropped has one event in it, kept as the shift ran: worked times
 * where they were changed. The Shift row is the truth; the event is a copy
 * the calendar, availability and the scheduler read.
 */
import type { Job, Shift } from "@prisma/client";

import type { Db as Client, DbTransaction } from "@/lib/prisma";

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
