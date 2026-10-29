/**
 * What a script outside Sigwald feeds the Work module: a schedule, a week at a
 * time (PUT /api/sigwald/shifts), and a job's contact roster. ops' shifts
 * module parses the weekly schedule and sends both; any other source can
 * use the same calls.
 *
 * A source names its job by a slug ("im"), the job's `importKey`; the first
 * week from a new slug makes the job. The schedule is the truth for its
 * week: a shift it no longer lists is deleted (unless it was dropped, which
 * stays as the record of a shift given away), one it lists is written over
 * (keeping how it went: dropped, worked times, note, timesheet, and a role
 * or supervisor the source didn't send), and a new one is added. Keeping
 * dropped ones also makes a read-back lossless: a source reads only what's
 * still to be worked, so a week it writes back leaves dropped ones out. Shifts added by hand are never the import's to delete,
 * except that one the schedule now covers (same job, overlapping times) is
 * folded into the imported shift, since the schedule has caught up.
 */
import type { Shift } from "@prisma/client";

import type { Db as Client, DbTransaction } from "@/lib/prisma";

import {
  ensureJobFeed,
  projectShift,
  unprojectShift,
} from "@/modules/work/feed";

type Db = Client | DbTransaction;

const DEFAULT_COLOR = "#E8590CFF";
const SOURCE_PATTERN = /^[a-z0-9-]+$/;
const MAX_SHIFTS_PER_WEEK = 50;
const MAX_CONTACTS = 500;

/**
 * The key a hand-added shift goes by where a source reads shifts back (GET
 * /api/sigwald/shifts). A week sent back with one in it skips it: hand-added
 * shifts change through the Work API, never through an import.
 */
export const HAND_KEY_PREFIX = "hand-";

/** One shift as a source sends it. */
export interface ImportedShift {
  /** Stable within its week, e.g. "2026-10-16T19:15|7v7 Soccer|Staff 1". */
  key: string;
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  /** Undefined when the source didn't send one: what the shift has stays. */
  role?: string | null;
  supervisor?: string | null;
  details: string | null;
}

export interface ShiftWeek {
  source: string;
  /** The job's name, if this week makes it. */
  feedName: string;
  color: string;
  windowStart: Date;
  windowEnd: Date;
  shifts: ImportedShift[];
}

function instant(value: unknown): Date | null {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value))
    return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const optional = (value: unknown, keepLines = false): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  return keepLines ? value : value.trim();
};

/** Like `optional`, but a field the source left out stays undefined. */
const ifSent = (raw: Record<string, unknown>, field: string) =>
  field in raw ? optional(raw[field]) : undefined;

function sourceOf(body: Record<string, unknown>): string | null {
  const source = body.source;
  return typeof source === "string" && SOURCE_PATTERN.test(source)
    ? source
    : null;
}

/**
 * Validates a PUT body. Every timestamp must carry an offset — a bare local
 * time would be read as server-local and land hours off. Returns the parsed
 * week, or a message for a 400.
 */
export function parseShiftWeek(json: unknown): ShiftWeek | string {
  const body = (json ?? {}) as Record<string, unknown>;
  const source = sourceOf(body);
  if (!source) return 'source must be a lowercase slug, e.g. "im"';
  const feedName = optional(body.feedName) ?? source;
  const color =
    typeof body.color === "string" && /^#[0-9A-Fa-f]{8}$/.test(body.color)
      ? body.color
      : DEFAULT_COLOR;

  const windowStart = instant(body.windowStart);
  const windowEnd = instant(body.windowEnd);
  if (!windowStart || !windowEnd)
    return "windowStart and windowEnd must be ISO instants with an offset";
  if (windowEnd <= windowStart) return "windowEnd must be after windowStart";
  if (windowEnd.getTime() - windowStart.getTime() > 8 * 24 * 3600 * 1000) {
    return "a window covers one schedule week, at most 8 days";
  }

  if (!Array.isArray(body.shifts))
    return "shifts must be a list (empty means no shifts this week)";
  if (body.shifts.length > MAX_SHIFTS_PER_WEEK)
    return `at most ${MAX_SHIFTS_PER_WEEK} shifts per week`;

  const seen = new Set<string>();
  const shifts: ImportedShift[] = [];
  for (const raw of body.shifts as Record<string, unknown>[]) {
    if (!raw || typeof raw.key !== "string" || !raw.key)
      return "every shift needs a key";
    if (raw.key.startsWith(HAND_KEY_PREFIX)) continue;
    if (seen.has(raw.key)) return `duplicate shift key ${raw.key}`;
    seen.add(raw.key);
    const title = optional(raw.title);
    if (!title) return `shift ${raw.key} is missing a title`;
    const start = instant(raw.start);
    const end = instant(raw.end);
    if (!start || !end)
      return `shift ${raw.key} needs start and end as ISO instants with an offset`;
    if (end <= start) return `shift ${raw.key} ends before it starts`;
    if (start < windowStart || start >= windowEnd)
      return `shift ${raw.key} starts outside the window`;
    shifts.push({
      key: raw.key,
      title,
      start,
      end,
      location: optional(raw.location),
      role: ifSent(raw, "role"),
      supervisor: ifSent(raw, "supervisor"),
      details: optional(raw.description, true),
    });
  }

  return { source, feedName, color, windowStart, windowEnd, shifts };
}

/** The job a source fills, made the first time it sends a week. */
async function importJob(
  db: Db,
  userId: string,
  week: Pick<ShiftWeek, "source" | "feedName" | "color">
) {
  const found = await db.job.findUnique({
    where: { userId_importKey: { userId, importKey: week.source } },
  });
  return (
    found ??
    db.job.create({
      data: {
        userId,
        importKey: week.source,
        name: week.feedName,
        color: week.color,
      },
    })
  );
}

/** What a hand-added shift had that the imported one taking its place lacks. */
function carried(hand: Shift, into: Shift) {
  return {
    dropped: into.dropped || hand.dropped,
    note: into.note ?? hand.note,
    workedStart: into.workedStart ?? hand.workedStart,
    workedEnd: into.workedEnd ?? hand.workedEnd,
    loggedAt: into.loggedAt ?? hand.loggedAt,
  };
}

/**
 * Writes one schedule week into its job (module comment). Must run inside a
 * transaction so a reader never sees the week half-written. Returns what
 * changed, and the job so the caller can bring its timesheet up to date.
 */
export async function importShiftWeek(db: Db, userId: string, week: ShiftWeek) {
  const job = await importJob(db, userId, week);
  const feedId = await ensureJobFeed(db, job);
  const inWindow = { gte: week.windowStart, lt: week.windowEnd };

  const listed = new Set(week.shifts.map((s) => s.key));
  const stale = await db.shift.findMany({
    where: {
      jobId: job.id,
      importKey: { not: null },
      dropped: false,
      start: inWindow,
    },
  });
  let removed = 0;
  for (const shift of stale) {
    if (listed.has(shift.importKey!)) continue;
    await unprojectShift(db, shift);
    await db.shift.delete({ where: { id: shift.id } });
    removed += 1;
  }

  for (const s of week.shifts) {
    const fields = {
      title: s.title,
      start: s.start,
      end: s.end,
      location: s.location,
      role: s.role,
      supervisor: s.supervisor,
      details: s.details,
    };
    let shift = await db.shift.upsert({
      where: { jobId_importKey: { jobId: job.id, importKey: s.key } },
      create: { ...fields, jobId: job.id, importKey: s.key },
      update: fields,
    });
    const covered = await db.shift.findMany({
      where: {
        jobId: job.id,
        importKey: null,
        start: { lt: s.end },
        end: { gt: s.start },
      },
    });
    for (const hand of covered) {
      shift = await db.shift.update({
        where: { id: shift.id },
        data: carried(hand, shift),
      });
      await unprojectShift(db, hand);
      await db.shift.delete({ where: { id: hand.id } });
    }
    await projectShift(db, feedId, shift);
  }

  return { job, result: { feedId, removed, written: week.shifts.length } };
}

/** A shift as a source reads it back: the shape ops' reminders and hand edits know. */
export interface SourceShift {
  id: string;
  /** "<source>:<key>"; a hand-added shift's key is "hand-<id>". */
  externalEventId: string;
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  description: string | null;
  role: string | null;
  supervisor: string | null;
  byHand: boolean;
}

/**
 * A source's job's shifts that overlap [from, to), soonest first, hand-added
 * ones included and dropped ones left out: what's still to be worked. No
 * contact details: what a source reads may end up in an alert.
 */
export async function listSourceShifts(
  db: Db,
  userId: string,
  source: string,
  from: Date,
  to: Date
): Promise<SourceShift[]> {
  const shifts = await db.shift.findMany({
    where: {
      job: { userId, importKey: source },
      dropped: false,
      start: { lt: to },
      end: { gt: from },
    },
    orderBy: { start: "asc" },
  });
  return shifts.map((s) => ({
    id: s.id,
    externalEventId: `${source}:${s.importKey ?? `${HAND_KEY_PREFIX}${s.id}`}`,
    title: s.title,
    start: s.start,
    end: s.end,
    location: s.location,
    description: s.details,
    role: s.role,
    supervisor: s.supervisor,
    byHand: s.importKey === null,
  }));
}

export interface ImportedContact {
  key: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}

export interface ContactRoster {
  source: string;
  contacts: ImportedContact[];
}

/** Validates a roster PUT body; the parsed roster, or a message for a 400. */
export function parseContactRoster(json: unknown): ContactRoster | string {
  const body = (json ?? {}) as Record<string, unknown>;
  const source = sourceOf(body);
  if (!source) return 'source must be a lowercase slug, e.g. "im"';
  if (!Array.isArray(body.contacts)) return "contacts must be a list";
  if (body.contacts.length > MAX_CONTACTS)
    return `at most ${MAX_CONTACTS} contacts`;
  const seen = new Set<string>();
  const contacts: ImportedContact[] = [];
  for (const raw of body.contacts as Record<string, unknown>[]) {
    if (!raw || typeof raw.key !== "string" || !raw.key)
      return "every contact needs a key";
    if (seen.has(raw.key)) return `duplicate contact key ${raw.key}`;
    seen.add(raw.key);
    const name = optional(raw.name);
    if (!name) return `contact ${raw.key} is missing a name`;
    contacts.push({
      key: raw.key,
      name,
      role: optional(raw.role),
      phone: optional(raw.phone),
      email: optional(raw.email),
    });
  }
  return { source, contacts };
}

/**
 * Replaces a source's job's imported contacts with the roster, in its order.
 * Contacts added by hand stay. Null when the source has sent no schedule
 * yet, so there's no job to put them on.
 */
export async function importContactRoster(
  db: Db,
  userId: string,
  roster: ContactRoster
) {
  const job = await db.job.findUnique({
    where: { userId_importKey: { userId, importKey: roster.source } },
    select: { id: true },
  });
  if (!job) return null;
  const { count: removed } = await db.jobContact.deleteMany({
    where: {
      jobId: job.id,
      importKey: { not: null, notIn: roster.contacts.map((c) => c.key) },
    },
  });
  for (const [position, c] of roster.contacts.entries()) {
    const fields = {
      name: c.name,
      role: c.role,
      phone: c.phone,
      email: c.email,
      position,
    };
    await db.jobContact.upsert({
      where: { jobId_importKey: { jobId: job.id, importKey: c.key } },
      create: { ...fields, jobId: job.id, importKey: c.key },
      update: fields,
    });
  }
  return { jobId: job.id, removed, written: roster.contacts.length };
}
