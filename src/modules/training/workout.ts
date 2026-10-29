/**
 * The Training module's one task per routine: named for it, due a cadence
 * after the last session (src/modules/training/cadence.ts), with what to do
 * in its description.
 *
 * It closes from either side. Logging a session on the Training page
 * finishes the open task; finishing the task anywhere else in Sigwald (Today,
 * Focus, Tasks, ops) becomes a session with nothing entered yet, by
 * `reconcileWorkouts`, which the sync loop runs and the page runs before it
 * reads. Either way the next session is planned from it.
 */
import type { Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { type Db as Client, type DbTransaction, prisma } from "@/lib/prisma";
import { userTimeZone } from "@/lib/user-time-zone";

import { tasksChanged } from "@/modules/hooks";
import { planWorkout } from "@/modules/training/cadence";
import {
  type Entry,
  type PastSession,
  type PlannedExercise,
  type Unit,
  entryLine,
  isUnit,
  prefillEntries,
} from "@/modules/training/sets";

type Db = Client | DbTransaction;

export const TRAINING_SOURCE = "TRAINING";

/** `Task.syncStatus` once a finished workout task has its session. */
const LOGGED = "logged";

/** How many past sessions a new one looks through for each exercise's last numbers. */
export const LOOKBACK = 20;

const openTaskWhere = (userId: string, routineId: string) => ({
  userId,
  source: TRAINING_SOURCE,
  externalTaskId: routineId,
  parentTaskId: null,
  status: { not: "completed" },
});

/** Finished workout tasks that have no session yet. */
const tickedTaskWhere = (userId: string, routineId?: string) => ({
  userId,
  source: TRAINING_SOURCE,
  ...(routineId ? { externalTaskId: routineId } : {}),
  status: "completed",
  OR: [{ syncStatus: null }, { syncStatus: { not: LOGGED } }],
});

/** A routine's plan as stored. Anything malformed in it is dropped, not thrown. */
export function readPlan(raw: Prisma.JsonValue): PlannedExercise[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { name, sets, reps } = item as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) return [];
    return [
      {
        name: name.trim(),
        sets: typeof sets === "number" && sets > 0 ? sets : 1,
        reps: typeof reps === "number" ? reps : null,
      },
    ];
  });
}

const sessionInclude = {
  entries: { orderBy: { position: "asc" } },
} satisfies Prisma.WorkoutInclude;

export type WorkoutWithEntries = Prisma.WorkoutGetPayload<{
  include: typeof sessionInclude;
}>;

/** A stored session as the pure helpers read it. */
export function toPastSession(w: WorkoutWithEntries): PastSession {
  return {
    unit: isUnit(w.unit) ? w.unit : "kg",
    entries: w.entries.map((e) => ({
      exercise: e.exercise,
      sets: e.sets,
      reps: e.reps,
      weight: e.weight,
    })),
  };
}

/** A routine's latest sessions, newest first. */
export function recentWorkouts(
  db: Db,
  routineId: string,
  take = LOOKBACK
): Promise<WorkoutWithEntries[]> {
  return db.workout.findMany({
    where: { routineId },
    orderBy: { at: "desc" },
    take,
    include: sessionInclude,
  });
}

/** The unit someone last entered weights in, or null before their first session. */
export async function lastUnit(db: Db, userId: string): Promise<Unit | null> {
  const last = await db.workout.findFirst({
    where: { routine: { userId }, ticked: false },
    orderBy: { at: "desc" },
    select: { unit: true },
  });
  return last && isUnit(last.unit) ? last.unit : null;
}

/** Keeps `Routine.lastDoneAt` on its latest session, whichever one changed. */
async function refreshLastDone(db: Db, routineId: string) {
  const { _max } = await db.workout.aggregate({
    where: { routineId },
    _max: { at: true },
  });
  await db.routine.update({
    where: { id: routineId },
    data: { lastDoneAt: _max.at },
  });
}

/**
 * Makes a routine's open workout task match its schedule: created, moved,
 * or removed when it no longer has one (no cadence, or archived). Only the
 * open task is ever touched; finished ones are history. Returns the id of a
 * task it created, so the caller can apply goal rules to it.
 */
export async function syncWorkoutTask(
  db: Db,
  userId: string,
  routineId: string,
  now: Date = newDate()
): Promise<string | null> {
  const routine = await db.routine.findFirst({
    where: { id: routineId, userId },
  });
  const open = await db.task.findFirst({
    where: openTaskWhere(userId, routineId),
  });
  let plan = null;
  if (routine) {
    const history = (await recentWorkouts(db, routineId)).map(toPastSession);
    const unit = history[0]?.unit ?? "kg";
    const lines = prefillEntries(readPlan(routine.plan), history, unit).map(
      (e) => entryLine(e, unit)
    );
    plan = planWorkout(routine, lines, now, await userTimeZone(db, userId));
  }

  if (!plan) {
    if (open) await db.task.delete({ where: { id: open.id } });
    return null;
  }

  const fields = {
    title: plan.title,
    description: plan.description,
    dueDate: plan.dueDate,
    postponedUntil: plan.postponedUntil,
    duration: plan.duration,
  };
  if (open) {
    await db.task.update({ where: { id: open.id }, data: fields });
    return null;
  }
  const created = await db.task.create({
    data: {
      ...fields,
      userId,
      status: "todo",
      source: TRAINING_SOURCE,
      externalTaskId: routineId,
      priority: "medium",
      category: "PERSONAL",
      // Task sync to Google/Outlook never takes these.
      skipSync: true,
    },
  });
  return created.id;
}

export interface SessionInput {
  at: Date;
  unit: Unit;
  note: string | null;
  entries: Entry[];
}

const entryRows = (entries: Entry[]) =>
  entries.map((e, position) => ({ ...e, position }));

/**
 * Logs a session. One done while the workout task was open is that session,
 * so the task is finished (and earns its XP); an older one is history being
 * filled in, and only moves the open task's day. A task ticked elsewhere
 * that has no session yet takes this one, rather than also getting an empty
 * one of its own. Either way the next session is planned from the latest.
 */
export async function logWorkout(
  userId: string,
  routineId: string,
  input: SessionInput
): Promise<WorkoutWithEntries | null> {
  const now = newDate();
  const result = await prisma.$transaction(async (tx) => {
    const routine = await tx.routine.findFirst({
      where: { id: routineId, userId },
      select: { id: true },
    });
    if (!routine) return null;
    const workout = await tx.workout.create({
      data: {
        routineId,
        at: input.at,
        unit: input.unit,
        note: input.note,
        entries: { create: entryRows(input.entries) },
      },
      include: sessionInclude,
    });
    await refreshLastDone(tx, routineId);
    await tx.task.updateMany({
      where: tickedTaskWhere(userId, routineId),
      data: { syncStatus: LOGGED },
    });
    const open = await tx.task.findFirst({
      where: openTaskWhere(userId, routineId),
    });
    if (open && input.at >= open.createdAt) {
      await tx.task.update({
        where: { id: open.id },
        data: { status: "completed", completedAt: now, syncStatus: LOGGED },
      });
    }
    const nextId = await syncWorkoutTask(tx, userId, routineId, now);
    return { workout, nextId };
  });
  if (result?.nextId) {
    await tasksChanged(prisma, userId, [result.nextId]);
  }
  return result?.workout ?? null;
}

/**
 * Changes a session: when it was, its unit, its note or its lines (all of
 * them, replaced). Filling one in this way makes it an ordinary session.
 */
export async function editWorkout(
  userId: string,
  workoutId: string,
  input: Partial<SessionInput>
): Promise<WorkoutWithEntries | null> {
  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.workout.findFirst({
      where: { id: workoutId, routine: { userId } },
      select: { id: true, routineId: true },
    });
    if (!found) return null;
    if (input.entries) {
      await tx.workoutEntry.deleteMany({ where: { workoutId } });
    }
    const workout = await tx.workout.update({
      where: { id: workoutId },
      data: {
        at: input.at,
        unit: input.unit,
        note: input.note,
        ticked: false,
        ...(input.entries
          ? { entries: { create: entryRows(input.entries) } }
          : {}),
      },
      include: sessionInclude,
    });
    await refreshLastDone(tx, found.routineId);
    const nextId = await syncWorkoutTask(tx, userId, found.routineId);
    return { workout, nextId };
  });
  if (result?.nextId) {
    await tasksChanged(prisma, userId, [result.nextId]);
  }
  return result?.workout ?? null;
}

/** Deletes a session logged by mistake; the next one is planned from the one before. */
export async function deleteWorkout(
  userId: string,
  workoutId: string
): Promise<boolean> {
  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.workout.findFirst({
      where: { id: workoutId, routine: { userId } },
      select: { id: true, routineId: true },
    });
    if (!found) return null;
    await tx.workout.delete({ where: { id: workoutId } });
    await refreshLastDone(tx, found.routineId);
    return { nextId: await syncWorkoutTask(tx, userId, found.routineId) };
  });
  if (result?.nextId) {
    await tasksChanged(prisma, userId, [result.nextId]);
  }
  return result !== null;
}

/**
 * Workout tasks finished outside the Training page become sessions with
 * nothing entered yet (dated when the task was finished, flagged `ticked`
 * so the page asks for what was done), and each routine gets its next
 * session. Run by the sync loop for everyone with Training on, and by the
 * page before it reads; cheap when there's nothing.
 */
export async function reconcileWorkouts(userId: string): Promise<number> {
  const finished = await prisma.task.findMany({
    where: tickedTaskWhere(userId),
    select: { id: true, externalTaskId: true, completedAt: true },
  });
  if (finished.length === 0) return 0;

  const now = newDate();
  const unit = (await lastUnit(prisma, userId)) ?? "kg";
  const created: string[] = [];
  for (const task of finished) {
    const nextId = await prisma.$transaction(async (tx) => {
      // Claim the task first: of two passes that saw it at once (the page
      // asks for several lists together), only one gets to log it.
      const claimed = await tx.task.updateMany({
        where: { ...tickedTaskWhere(userId), id: task.id },
        data: { syncStatus: LOGGED },
      });
      if (claimed.count === 0) return null;
      const routine = task.externalTaskId
        ? await tx.routine.findFirst({
            where: { id: task.externalTaskId, userId },
            select: { id: true },
          })
        : null;
      if (!routine) return null;
      await tx.workout.create({
        data: {
          routineId: routine.id,
          at: task.completedAt ?? now,
          unit,
          ticked: true,
        },
      });
      await refreshLastDone(tx, routine.id);
      return syncWorkoutTask(tx, userId, routine.id, now);
    });
    if (nextId) created.push(nextId);
  }
  if (created.length > 0) {
    await tasksChanged(prisma, userId, created);
  }
  return finished.length;
}
