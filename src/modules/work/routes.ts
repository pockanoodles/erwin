/**
 * The Work module's HTTP handlers. The route files under
 * src/app/api/sigwald/work (and the import's src/app/api/sigwald/shifts) only
 * forward here, so the module's server code lives in one folder. Every
 * handler answers 409 module_off while Work is off.
 */
import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { dayIn, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";
import { syncJobFeed } from "@/modules/work/feed";
import {
  importContactRoster,
  importShiftWeek,
  listSourceShifts,
  parseContactRoster,
  parseShiftWeek,
} from "@/modules/work/imports";
import {
  dayDate,
  hasPayPeriod,
  jobRow,
  jobRows,
  payPeriodAt,
  periodRow,
  periodRows,
  spanOfDays,
  toContactRow,
  workSettings,
} from "@/modules/work/rows";
import {
  addShift,
  deleteShift,
  editShift,
  listShiftRows,
  nextShift,
} from "@/modules/work/shifts";
import {
  WORK_SOURCE,
  parseTimesheetKey,
  reconcileTimesheets,
  reopenPeriod,
  submitPeriod,
} from "@/modules/work/timesheet";

const LOG_SOURCE = "WorkAPI";

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim() || null)
    .nullable()
    .optional();

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A day is yyyy-MM-dd");

const moment = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

const jobFields = {
  name: z.string().trim().min(1, "A job needs a name").max(120),
  color: z.string().regex(/^#[0-9A-Fa-f]{8}$/, "A colour is #RRGGBBAA"),
  hourlyRate: z.number().min(0).max(10_000).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/, "A currency is a code like USD"),
  payPeriodDays: z.union([z.literal(7), z.literal(14)]).nullable(),
  payPeriodStart: day.nullable(),
  timesheetDueDays: z.number().int().min(0).max(31),
  timesheetsFrom: day.nullable(),
  weeklyCapHours: z.number().positive().max(168).nullable(),
  links: z
    .array(
      z.object({
        label: z.string().trim().max(80),
        url: z.string().trim().min(1, "A link needs an address").max(2000),
      })
    )
    .max(20),
  notes: text(5000),
};

const createJobSchema = z
  .object(jobFields)
  .partial()
  .extend({ name: jobFields.name });
const updateJobSchema = z
  .object(jobFields)
  .partial()
  .extend({ archived: z.boolean().optional() });

const shiftFields = {
  title: z.string().trim().min(1, "A shift needs a title").max(200),
  start: moment,
  end: moment,
  location: text(200),
  role: text(120),
  supervisor: text(120),
  note: text(5000),
};

const createShiftSchema = z.object(shiftFields);
const updateShiftSchema = z.object(shiftFields).partial().extend({
  dropped: z.boolean().optional(),
  workedStart: moment.nullable().optional(),
  workedEnd: moment.nullable().optional(),
});

const contactFields = {
  name: z.string().trim().min(1, "A contact needs a name").max(120),
  role: text(120),
  phone: text(40),
  email: text(200),
  notes: text(2000),
};
const createContactSchema = z.object(contactFields);
const updateContactSchema = z.object(contactFields).partial();

type Ctx = { params: Promise<{ id: string }> };
type PeriodCtx = { params: Promise<{ id: string; first: string }> };

async function authorize(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth;
  const off = await moduleOffResponse(auth.userId, "work");
  return off ? { response: off } : auth;
}

function failed(message: string, error: unknown) {
  logger.error(
    message,
    { error: error instanceof Error ? error.message : String(error) },
    LOG_SOURCE
  );
  return NextResponse.json({ error: message }, { status: 500 });
}

function invalid(error: z.ZodError) {
  return NextResponse.json(
    { error: error.issues.map((i) => i.message).join("; ") },
    { status: 400 }
  );
}

const badRequest = (error: string) =>
  NextResponse.json({ error }, { status: 400 });

const notFound = (what: string) =>
  NextResponse.json({ error: `No such ${what}` }, { status: 404 });

const body = (request: NextRequest) => request.json().catch(() => null);

type JobData = z.infer<typeof updateJobSchema>;

/** A job's fields as Prisma takes them: days as dates. */
function jobData(data: JobData) {
  const { payPeriodStart, timesheetsFrom, ...rest } = data;
  return {
    ...rest,
    ...(payPeriodStart !== undefined
      ? { payPeriodStart: dayDate(payPeriodStart) }
      : {}),
    ...(timesheetsFrom !== undefined
      ? { timesheetsFrom: dayDate(timesheetsFrom) }
      : {}),
  };
}

/**
 * A pay period needs both its length and a day one starts. Turning one on
 * counts timesheets from the period it's in now unless a day is given:
 * hours from before were handled before Sigwald tracked them.
 */
async function payPeriodRule(
  userId: string,
  before: { payPeriodDays: number | null; payPeriodStart: Date | null } | null,
  data: JobData
): Promise<string | JobData> {
  const days =
    data.payPeriodDays !== undefined
      ? data.payPeriodDays
      : (before?.payPeriodDays ?? null);
  const start =
    data.payPeriodStart !== undefined
      ? dayDate(data.payPeriodStart)
      : (before?.payPeriodStart ?? null);
  if ((days === null) !== (start === null)) {
    return "A pay period needs both how long it is and a day one starts";
  }
  const turningOn = days !== null && (!before || !hasPayPeriod(before));
  if (!turningOn || data.timesheetsFrom !== undefined) return data;
  const { timeZone } = await workSettings(prisma, userId);
  const period = payPeriodAt(
    { payPeriodDays: days, payPeriodStart: start },
    dayIn(newDate(), timeZone)
  );
  return { ...data, timesheetsFrom: period?.first ?? null };
}

/** GET /api/sigwald/work/jobs[?archived=1]: every job, or the archived. */
export async function listJobs(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    await reconcileTimesheets(auth.userId);
    const archived = request.nextUrl.searchParams.get("archived") === "1";
    return NextResponse.json({
      jobs: await jobRows(prisma, auth.userId, archived),
    });
  } catch (error) {
    return failed("Failed to list jobs", error);
  }
}

/** POST /api/sigwald/work/jobs: adds a job, and its calendar feed. */
export async function createJob(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const parsed = createJobSchema.safeParse(await body(request));
    if (!parsed.success) return invalid(parsed.error);
    const data = await payPeriodRule(auth.userId, null, parsed.data);
    if (typeof data === "string") return badRequest(data);

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: { ...jobData(data), name: parsed.data.name, userId: auth.userId },
      });
      await syncJobFeed(tx, created);
      return created;
    });
    return NextResponse.json(
      { job: await jobRow(prisma, auth.userId, job.id) },
      { status: 201 }
    );
  } catch (error) {
    return failed("Failed to add job", error);
  }
}

/** PATCH /api/sigwald/work/jobs/:id: edits, archives or restores a job. */
export async function updateJob(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = updateJobSchema.safeParse(await body(request));
    if (!parsed.success) return invalid(parsed.error);
    const found = await prisma.job.findFirst({
      where: { id, userId: auth.userId },
    });
    if (!found) return notFound("job");
    const data = await payPeriodRule(auth.userId, found, parsed.data);
    if (typeof data === "string") return badRequest(data);

    await prisma.$transaction(async (tx) => {
      const job = await tx.job.update({ where: { id }, data: jobData(data) });
      await syncJobFeed(tx, job);
    });
    await reconcileTimesheets(auth.userId);
    return NextResponse.json({ job: await jobRow(prisma, auth.userId, id) });
  } catch (error) {
    return failed("Failed to change job", error);
  }
}

/** DELETE /api/sigwald/work/jobs/:id: deletes a job with its shifts, contacts and calendar feed. */
export async function removeJob(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const found = await prisma.job.findFirst({
      where: { id, userId: auth.userId },
    });
    if (!found) return notFound("job");
    await prisma.$transaction(async (tx) => {
      await tx.job.delete({ where: { id } });
      if (found.feedId)
        await tx.calendarFeed.deleteMany({ where: { id: found.feedId } });
    });
    await reconcileTimesheets(auth.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed("Failed to delete job", error);
  }
}

/** GET /api/sigwald/work/shifts?from=&to=[&jobId=]: shifts overlapping the range, soonest first. */
export async function listShifts(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const params = request.nextUrl.searchParams;
    const from = new Date(params.get("from") ?? "");
    const to = new Date(params.get("to") ?? "");
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to <= from
    ) {
      return badRequest("from and to (ISO, to after from) are required");
    }
    await reconcileTimesheets(auth.userId);
    const shifts = await listShiftRows(
      auth.userId,
      from,
      to,
      params.get("jobId") ?? undefined
    );
    return NextResponse.json({ shifts });
  } catch (error) {
    return failed("Failed to list shifts", error);
  }
}

/** POST /api/sigwald/work/jobs/:id/shifts: adds a shift by hand. */
export async function createShift(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = createShiftSchema.safeParse(await body(request));
    if (!parsed.success) return invalid(parsed.error);
    if (parsed.data.end <= parsed.data.start)
      return badRequest("A shift ends after it starts");
    const shift = await addShift(auth.userId, id, parsed.data);
    if (!shift) return notFound("job");
    return NextResponse.json({ shift }, { status: 201 });
  } catch (error) {
    return failed("Failed to add shift", error);
  }
}

/** PATCH /api/sigwald/work/shifts/:id: drops, restores or changes a shift. */
export async function updateShift(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = updateShiftSchema.safeParse(await body(request));
    if (!parsed.success) return invalid(parsed.error);
    const result = await editShift(auth.userId, id, parsed.data);
    if (result === "not_found") return notFound("shift");
    if (result === "imported") {
      return badRequest(
        "This shift comes from the schedule, so only the schedule changes its times and details"
      );
    }
    if (result === "ends_before_start")
      return badRequest("A shift ends after it starts");
    return NextResponse.json({ shift: result });
  } catch (error) {
    return failed("Failed to change shift", error);
  }
}

/** DELETE /api/sigwald/work/shifts/:id: deletes a shift added by hand. */
export async function removeShift(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const result = await deleteShift(auth.userId, id);
    if (result === "not_found") return notFound("shift");
    if (result === "imported") {
      return NextResponse.json(
        {
          error:
            "This shift comes from the schedule and the next import would bring it back. Drop it instead.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed("Failed to delete shift", error);
  }
}

/** GET /api/sigwald/work/jobs/:id/periods: its pay periods, newest first. */
export async function listPeriods(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    await reconcileTimesheets(auth.userId);
    const periods = await periodRows(prisma, auth.userId, id);
    if (!periods) return notFound("job");
    return NextResponse.json({ periods });
  } catch (error) {
    return failed("Failed to list pay periods", error);
  }
}

/** POST|DELETE /api/sigwald/work/jobs/:id/periods/:first: marks a period's hours submitted, or takes them back. */
export async function markPeriod(
  request: NextRequest,
  { params }: PeriodCtx,
  submitted: boolean
) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id, first } = await params;
    if (!day.safeParse(first).success)
      return badRequest("A period is named by its first day, yyyy-MM-dd");
    const job = await prisma.job.findFirst({
      where: { id, userId: auth.userId },
    });
    if (!job) return notFound("job");
    if (!hasPayPeriod(job)) return badRequest("This job has no pay period");
    if (payPeriodAt(job, first)?.first !== first)
      return badRequest("That day doesn't start a pay period");
    const done = submitted
      ? await submitPeriod(auth.userId, id, first)
      : await reopenPeriod(auth.userId, id, first);
    if (!done) return notFound("job");
    return NextResponse.json({
      period: await periodRow(prisma, auth.userId, id, first),
    });
  } catch (error) {
    return failed("Failed to change the pay period", error);
  }
}

/** GET /api/sigwald/work/jobs/:id/contacts: the people to reach at a job. */
export async function listContacts(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const job = await prisma.job.findFirst({
      where: { id, userId: auth.userId },
      include: {
        contacts: { orderBy: [{ position: "asc" }, { name: "asc" }] },
      },
    });
    if (!job) return notFound("job");
    return NextResponse.json({ contacts: job.contacts.map(toContactRow) });
  } catch (error) {
    return failed("Failed to list contacts", error);
  }
}

/** POST /api/sigwald/work/jobs/:id/contacts: adds a contact by hand, after the rest. */
export async function createContact(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = createContactSchema.safeParse(await body(request));
    if (!parsed.success) return invalid(parsed.error);
    const job = await prisma.job.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    });
    if (!job) return notFound("job");
    const { _max } = await prisma.jobContact.aggregate({
      where: { jobId: id },
      _max: { position: true },
    });
    const contact = await prisma.jobContact.create({
      data: { ...parsed.data, jobId: id, position: (_max.position ?? -1) + 1 },
    });
    return NextResponse.json(
      { contact: toContactRow(contact) },
      { status: 201 }
    );
  } catch (error) {
    return failed("Failed to add contact", error);
  }
}

/** PATCH /api/sigwald/work/contacts/:id: changes a contact. */
export async function updateContact(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = updateContactSchema.safeParse(await body(request));
    if (!parsed.success) return invalid(parsed.error);
    const found = await prisma.jobContact.findFirst({
      where: { id, job: { userId: auth.userId } },
    });
    if (!found) return notFound("contact");
    const contact = await prisma.jobContact.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ contact: toContactRow(contact) });
  } catch (error) {
    return failed("Failed to change contact", error);
  }
}

/** DELETE /api/sigwald/work/contacts/:id: removes a contact. */
export async function removeContact(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const { count } = await prisma.jobContact.deleteMany({
      where: { id, job: { userId: auth.userId } },
    });
    if (count === 0) return notFound("contact");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed("Failed to delete contact", error);
  }
}

/** GET /api/sigwald/work/next: the shift on now, or the next within a day and a half. */
export async function getNextShift(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    return NextResponse.json({ shift: await nextShift(auth.userId) });
  } catch (error) {
    return failed("Failed to find the next shift", error);
  }
}

/**
 * GET /api/sigwald/work/tasks/:id: the pay period behind a "Submit hours"
 * task, with its job and shifts, for Focus and the task sheet.
 */
export async function taskTimesheet(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    await reconcileTimesheets(auth.userId);
    const task = await prisma.task.findFirst({
      where: { id, userId: auth.userId, source: WORK_SOURCE },
      select: { externalTaskId: true },
    });
    const key = parseTimesheetKey(task?.externalTaskId ?? null);
    const job = key ? await jobRow(prisma, auth.userId, key.jobId) : null;
    if (!key || !job || !job.payPeriodDays) return notFound("timesheet");
    const period = await periodRow(prisma, auth.userId, job.id, key.first);
    if (!period) return notFound("timesheet");
    const { timeZone } = await workSettings(prisma, auth.userId);
    const span = spanOfDays(period, timeZone);
    const shifts = await listShiftRows(auth.userId, span.gte, span.lt, job.id);
    return NextResponse.json({
      job,
      period,
      shifts: shifts.filter((s) => new Date(s.start) >= span.gte),
    });
  } catch (error) {
    return failed("Failed to load the timesheet", error);
  }
}

/**
 * PUT /api/sigwald/shifts
 * Body: { source, feedName?, color?, windowStart, windowEnd, shifts: [{ key, title, start, end, location?, role?, supervisor?, description? }] }
 * Writes one schedule week into the source's job (src/modules/work/imports.ts).
 * An empty `shifts` list is a real answer — that week has none — and clears
 * the week's imported shifts. Returns { feedId, removed, written }.
 */
export async function putShiftWeek(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const week = parseShiftWeek(await body(request));
    if (typeof week === "string")
      return new NextResponse(week, { status: 400 });
    const { result } = await prisma.$transaction((tx) =>
      importShiftWeek(tx, auth.userId, week)
    );
    await reconcileTimesheets(auth.userId);
    return NextResponse.json(result);
  } catch (error) {
    return failed("Failed to import the shift week", error);
  }
}

/**
 * GET /api/sigwald/shifts?source=im&from=<iso>&to=<iso>
 * The source's job's shifts overlapping [from, to), soonest first, without
 * dropped ones — what ops' reminders poll and its hand edits read back.
 */
export async function getSourceShifts(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const params = request.nextUrl.searchParams;
    const source = params.get("source") ?? "";
    const from = new Date(params.get("from") ?? "");
    const to = new Date(params.get("to") ?? "");
    if (
      !source ||
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to <= from
    ) {
      return new NextResponse(
        "source, from and to (ISO, to after from) are required",
        { status: 400 }
      );
    }
    return NextResponse.json({
      shifts: await listSourceShifts(prisma, auth.userId, source, from, to),
    });
  } catch (error) {
    return failed("Failed to list shifts", error);
  }
}

/**
 * PUT /api/sigwald/work/import/contacts
 * Body: { source, contacts: [{ key, name, role?, phone?, email? }] }
 * Replaces the source's job's imported contacts with this roster; ones added
 * by hand stay. 404 until the source has sent a schedule week (no job yet).
 * Returns { jobId, removed, written }.
 */
export async function putContactRoster(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const roster = parseContactRoster(await body(request));
    if (typeof roster === "string") return badRequest(roster);
    const result = await prisma.$transaction((tx) =>
      importContactRoster(tx, auth.userId, roster)
    );
    if (!result) return notFound(`job for source ${roster.source}`);
    return NextResponse.json(result);
  } catch (error) {
    return failed("Failed to import contacts", error);
  }
}
