/**
 * The Training module's HTTP handlers. The route files under
 * src/app/api/erwin/training only forward here, so the module's server code
 * lives in one folder. Every handler answers 409 module_off while Training
 * is off.
 */
import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { dayInTimeZone, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { userTimeZone } from "@/lib/user-time-zone";

import { moduleOffResponse } from "@/modules/api";
import { tasksChanged } from "@/modules/hooks";
import { nextSession } from "@/modules/training/cadence";
import { keptEntries } from "@/modules/training/sets";
import type { RoutineRow, WorkoutRow } from "@/modules/training/types";
import {
  LOOKBACK,
  TRAINING_SOURCE,
  type WorkoutWithEntries,
  deleteWorkout,
  editWorkout,
  lastUnit,
  logWorkout,
  readPlan,
  recentWorkouts,
  reconcileWorkouts,
  syncWorkoutTask,
  toPastSession,
} from "@/modules/training/workout";

const LOG_SOURCE = "TrainingAPI";

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim() || null)
    .nullable()
    .optional();

const planSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "Each exercise needs a name").max(120),
      sets: z.number().int().min(1).max(100),
      reps: z.number().int().min(1).max(1000).nullable(),
    })
  )
  .max(50);

const routineFields = {
  name: z.string().trim().min(1, "A routine needs a name").max(120),
  notes: text(5000),
  cadenceDays: z.number().positive().max(365).nullable().optional(),
  minutes: z.number().int().min(5).max(600).optional(),
  plan: planSchema.optional(),
};

const createSchema = z.object(routineFields);
const updateSchema = z
  .object({ ...routineFields, name: routineFields.name.optional() })
  .extend({ archived: z.boolean().optional() });

const entrySchema = z.object({
  exercise: z.string().max(120),
  sets: z.number().int().min(0).max(100),
  reps: z.number().int().min(0).max(1000).nullable(),
  weight: z.number().min(0).max(2000).nullable(),
});

const sessionFields = {
  at: z
    .string()
    .datetime({ offset: true })
    .transform((s) => new Date(s)),
  unit: z.enum(["kg", "lb"]),
  note: text(5000),
  entries: z.array(entrySchema).max(100),
};

const logSchema = z.object({
  ...sessionFields,
  at: sessionFields.at.optional(),
});
const editSchema = z.object(sessionFields).partial();

type Ctx = { params: Promise<{ id: string }> };

async function authorize(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth;
  const off = await moduleOffResponse(auth.userId, "training");
  return off ? { response: off } : auth;
}

type RoutineRecord = Parameters<typeof nextSession>[0] & {
  id: string;
  notes: string | null;
  plan: Parameters<typeof readPlan>[0];
  _count: { workouts: number };
};

function toRoutineRow(r: RoutineRecord, timeZone: string): RoutineRow {
  const next = nextSession(r);
  return {
    id: r.id,
    name: r.name,
    notes: r.notes,
    cadenceDays: r.cadenceDays,
    minutes: r.minutes,
    plan: readPlan(r.plan),
    lastDoneAt: r.lastDoneAt?.toISOString() ?? null,
    archived: r.archived,
    createdAt: r.createdAt.toISOString(),
    nextDue: next
      ? dayInTimeZone(next, timeZone).toISOString().slice(0, 10)
      : null,
    sessions: r._count.workouts,
  };
}

function toWorkoutRow(w: WorkoutWithEntries, routineName: string): WorkoutRow {
  const { unit, entries } = toPastSession(w);
  return {
    id: w.id,
    routineId: w.routineId,
    routineName,
    at: w.at.toISOString(),
    unit,
    note: w.note,
    ticked: w.ticked,
    entries,
  };
}

const withCount = { _count: { select: { workouts: true } } } as const;

async function routineRow(userId: string, id: string) {
  const routine = await prisma.routine.findFirst({
    where: { id, userId },
    include: withCount,
  });
  return routine
    ? toRoutineRow(routine, await userTimeZone(prisma, userId))
    : null;
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

const notFound = (what: string) =>
  NextResponse.json({ error: `No such ${what}` }, { status: 404 });

/**
 * GET /api/erwin/training/routines[?archived=1]: every routine, or the
 * archived, and the unit weights were last entered in (null before any).
 */
export async function listRoutines(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    await reconcileWorkouts(auth.userId);
    const archived = request.nextUrl.searchParams.get("archived") === "1";
    const [routines, timeZone, unit] = await Promise.all([
      prisma.routine.findMany({
        where: { userId: auth.userId, archived },
        include: withCount,
        orderBy: { name: "asc" },
      }),
      userTimeZone(prisma, auth.userId),
      lastUnit(prisma, auth.userId),
    ]);
    return NextResponse.json({
      routines: routines.map((r) => toRoutineRow(r, timeZone)),
      unit,
    });
  } catch (error) {
    return failed("Failed to list routines", error);
  }
}

/** POST /api/erwin/training/routines: adds a routine, and its workout task if it has a schedule. */
export async function createRoutine(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const parsed = createSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) return invalid(parsed.error);

    const routine = await prisma.routine.create({
      data: { ...parsed.data, userId: auth.userId },
      select: { id: true },
    });
    const taskId = await syncWorkoutTask(prisma, auth.userId, routine.id);
    if (taskId) await tasksChanged(prisma, auth.userId, [taskId]);
    return NextResponse.json(
      { routine: await routineRow(auth.userId, routine.id) },
      { status: 201 }
    );
  } catch (error) {
    return failed("Failed to add routine", error);
  }
}

/** PATCH /api/erwin/training/routines/:id: edits, archives or restores a routine. */
export async function updateRoutine(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = updateSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) return invalid(parsed.error);

    const found = await prisma.routine.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    });
    if (!found) return notFound("routine");
    await prisma.routine.update({ where: { id }, data: parsed.data });
    const taskId = await syncWorkoutTask(prisma, auth.userId, id);
    if (taskId) await tasksChanged(prisma, auth.userId, [taskId]);
    return NextResponse.json({ routine: await routineRow(auth.userId, id) });
  } catch (error) {
    return failed("Failed to change routine", error);
  }
}

/** GET /api/erwin/training/routines/:id/workouts: its sessions, newest first. */
export async function listRoutineWorkouts(
  request: NextRequest,
  { params }: Ctx
) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    await reconcileWorkouts(auth.userId);
    const routine = await prisma.routine.findFirst({
      where: { id, userId: auth.userId },
      select: { name: true },
    });
    if (!routine) return notFound("routine");
    const workouts = await recentWorkouts(prisma, id, 200);
    return NextResponse.json({
      workouts: workouts.map((w) => toWorkoutRow(w, routine.name)),
    });
  } catch (error) {
    return failed("Failed to list sessions", error);
  }
}

/**
 * POST /api/erwin/training/routines/:id/workouts  { unit, entries, note?, at? }
 *
 * Logs a session. It finishes the open workout task and plans the next one.
 * `at` defaults to now.
 */
export async function createWorkout(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = logSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);

    const workout = await logWorkout(auth.userId, id, {
      at: parsed.data.at ?? newDate(),
      unit: parsed.data.unit,
      note: parsed.data.note ?? null,
      entries: keptEntries(parsed.data.entries),
    });
    if (!workout) return notFound("routine");
    const routine = await prisma.routine.findUniqueOrThrow({
      where: { id },
      select: { name: true },
    });
    return NextResponse.json(
      { workout: toWorkoutRow(workout, routine.name) },
      { status: 201 }
    );
  } catch (error) {
    return failed("Failed to log session", error);
  }
}

/** GET /api/erwin/training/workouts: every routine's sessions, newest first. */
export async function listWorkouts(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    await reconcileWorkouts(auth.userId);
    const workouts = await prisma.workout.findMany({
      where: { routine: { userId: auth.userId } },
      orderBy: { at: "desc" },
      take: 200,
      include: {
        entries: { orderBy: { position: "asc" } },
        routine: { select: { name: true } },
      },
    });
    return NextResponse.json({
      workouts: workouts.map((w) => toWorkoutRow(w, w.routine.name)),
    });
  } catch (error) {
    return failed("Failed to list sessions", error);
  }
}

/** PATCH /api/erwin/training/workouts/:id: changes a session, or fills in one ticked elsewhere. */
export async function updateWorkout(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const parsed = editSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);

    const { entries, ...rest } = parsed.data;
    const workout = await editWorkout(auth.userId, id, {
      ...rest,
      ...(entries ? { entries: keptEntries(entries) } : {}),
    });
    if (!workout) return notFound("session");
    const routine = await prisma.routine.findUniqueOrThrow({
      where: { id: workout.routineId },
      select: { name: true },
    });
    return NextResponse.json({ workout: toWorkoutRow(workout, routine.name) });
  } catch (error) {
    return failed("Failed to change session", error);
  }
}

/** DELETE /api/erwin/training/workouts/:id: removes a session logged by mistake. */
export async function removeWorkout(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    if (!(await deleteWorkout(auth.userId, id))) return notFound("session");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed("Failed to delete session", error);
  }
}

/**
 * GET /api/erwin/training/tasks/:id: the routine behind a workout task, with
 * its latest sessions, for Focus and the task sheet to show what to do.
 */
export async function taskRoutine(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const task = await prisma.task.findFirst({
      where: { id, userId: auth.userId, source: TRAINING_SOURCE },
      select: { externalTaskId: true },
    });
    const routine = task?.externalTaskId
      ? await routineRow(auth.userId, task.externalTaskId)
      : null;
    if (!routine) return notFound("routine");
    const workouts = await recentWorkouts(prisma, routine.id, LOOKBACK);
    return NextResponse.json({
      routine,
      workouts: workouts.map((w) => toWorkoutRow(w, routine.name)),
    });
  } catch (error) {
    return failed("Failed to load the routine", error);
  }
}
