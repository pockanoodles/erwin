import type { Db as Client, DbTransaction } from "@/lib/prisma";

// Work shifts are projected into Erwin by the ops shifts module, which parses
// the weekly schedule PDFs. Each schedule source gets one LOCAL feed, keyed by
// a synthetic `url` so a rename in the UI never forks it. The PDF for a week
// is the whole truth for that week: a revised schedule (a swap, a dropped
// shift) replaces every event that starts inside the window, so nothing stale
// survives. LOCAL feeds have no account, so no sync job ever touches them.
const FEED_URL_PREFIX = "ops-shifts:";
const DEFAULT_COLOR = "#E8590CFF";
const SOURCE_PATTERN = /^[a-z0-9-]+$/;
const MAX_SHIFTS_PER_WEEK = 50;

export interface ShiftInput {
  /** Stable within a week, e.g. "2026-10-16T19:15|7v7 Soccer". */
  key: string;
  title: string;
  start: string;
  end: string;
  location?: string | null;
  description?: string | null;
}

export interface ShiftWeek {
  source: string;
  feedName: string;
  color: string;
  windowStart: Date;
  windowEnd: Date;
  shifts: { key: string; title: string; start: Date; end: Date; location: string | null; description: string | null }[];
}

type Db = Client | DbTransaction;

function instant(value: unknown): Date | null {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Validates a PUT body. Every timestamp must carry an offset — a bare local
 * time would be read as server-local and land hours off. Returns the parsed
 * week, or a message for a 400.
 */
export function parseShiftWeek(json: unknown): ShiftWeek | string {
  const body = (json ?? {}) as Record<string, unknown>;
  const source = body.source;
  if (typeof source !== "string" || !SOURCE_PATTERN.test(source)) {
    return "source must be a lowercase slug, e.g. \"im\"";
  }
  const feedName = typeof body.feedName === "string" && body.feedName.trim() ? body.feedName.trim() : source;
  const color = typeof body.color === "string" && /^#[0-9A-Fa-f]{8}$/.test(body.color) ? body.color : DEFAULT_COLOR;

  const windowStart = instant(body.windowStart);
  const windowEnd = instant(body.windowEnd);
  if (!windowStart || !windowEnd) return "windowStart and windowEnd must be ISO instants with an offset";
  if (windowEnd <= windowStart) return "windowEnd must be after windowStart";
  if (windowEnd.getTime() - windowStart.getTime() > 8 * 24 * 3600 * 1000) {
    return "a window covers one schedule week, at most 8 days";
  }

  if (!Array.isArray(body.shifts)) return "shifts must be a list (empty means no shifts this week)";
  if (body.shifts.length > MAX_SHIFTS_PER_WEEK) return `at most ${MAX_SHIFTS_PER_WEEK} shifts per week`;

  const seen = new Set<string>();
  const shifts: ShiftWeek["shifts"] = [];
  for (const raw of body.shifts as ShiftInput[]) {
    if (!raw || typeof raw.key !== "string" || !raw.key) return "every shift needs a key";
    if (seen.has(raw.key)) return `duplicate shift key ${raw.key}`;
    seen.add(raw.key);
    if (typeof raw.title !== "string" || !raw.title.trim()) return `shift ${raw.key} is missing a title`;
    const start = instant(raw.start);
    const end = instant(raw.end);
    if (!start || !end) return `shift ${raw.key} needs start and end as ISO instants with an offset`;
    if (end <= start) return `shift ${raw.key} ends before it starts`;
    if (start < windowStart || start >= windowEnd) return `shift ${raw.key} starts outside the window`;
    shifts.push({
      key: raw.key,
      title: raw.title.trim(),
      start,
      end,
      location: typeof raw.location === "string" && raw.location.trim() ? raw.location.trim() : null,
      description: typeof raw.description === "string" && raw.description.trim() ? raw.description : null,
    });
  }

  return { source, feedName, color, windowStart, windowEnd, shifts };
}

export function shiftFeedUrl(source: string): string {
  return `${FEED_URL_PREFIX}${source}`;
}

async function ensureShiftFeed(db: Db, userId: string, week: ShiftWeek) {
  const url = shiftFeedUrl(week.source);
  const existing = await db.calendarFeed.findFirst({ where: { userId, type: "LOCAL", url } });
  if (existing) return existing;
  return db.calendarFeed.create({
    data: { userId, type: "LOCAL", url, name: week.feedName, color: week.color, enabled: true },
  });
}

/**
 * Replaces every event in the source's feed that starts inside the window
 * with the given shifts. Must run inside a transaction so a reader never sees
 * the week half-written.
 */
export async function replaceShiftWeek(db: Db, userId: string, week: ShiftWeek) {
  const feed = await ensureShiftFeed(db, userId, week);
  const removed = await db.calendarEvent.deleteMany({
    where: { feedId: feed.id, start: { gte: week.windowStart, lt: week.windowEnd } },
  });
  if (week.shifts.length > 0) {
    await db.calendarEvent.createMany({
      data: week.shifts.map((s) => ({
        feedId: feed.id,
        externalEventId: `${week.source}:${s.key}`,
        title: s.title,
        description: s.description,
        location: s.location,
        start: s.start,
        end: s.end,
        status: "confirmed",
        transparency: "OPAQUE",
      })),
    });
  }
  return { feedId: feed.id, removed: removed.count, written: week.shifts.length };
}

/** Shifts from the source's feed that overlap [from, to), soonest first. */
export async function listShifts(db: Db, userId: string, source: string, from: Date, to: Date) {
  return db.calendarEvent.findMany({
    where: {
      feed: { userId, type: "LOCAL", url: shiftFeedUrl(source) },
      start: { lt: to },
      end: { gt: from },
    },
    orderBy: { start: "asc" },
    select: { externalEventId: true, title: true, start: true, end: true, location: true, description: true },
  });
}
