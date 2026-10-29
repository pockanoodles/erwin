/**
 * The People module's one task per person: "Reach out to <name>", due a
 * cadence after the last conversation (src/modules/people/cadence.ts).
 *
 * It closes from either side. Logging a conversation on the People page
 * finishes the open task; finishing the task anywhere else in Sigwald (Today,
 * Focus, Tasks, ops) is logged as a conversation by `reconcileReachOuts`,
 * which the sync loop runs. Either way the next check-in is planned from it.
 */
import { newDate } from "@/lib/date-utils";
import { type Db as Client, type DbTransaction, prisma } from "@/lib/prisma";
import { userTimeZone } from "@/lib/user-time-zone";

import { tasksChanged } from "@/modules/hooks";
import { planReachOut } from "@/modules/people/cadence";

type Db = Client | DbTransaction;

export const PEOPLE_SOURCE = "PEOPLE";

/** `Task.syncStatus` once a finished reach-out has been logged as a conversation. */
const LOGGED = "logged";

const openTaskWhere = (userId: string, personId: string) => ({
  userId,
  source: PEOPLE_SOURCE,
  externalTaskId: personId,
  parentTaskId: null,
  status: { not: "completed" },
});

/**
 * Makes a person's open reach-out task match their cadence: created, moved,
 * or removed when they no longer have one (no cadence, or archived). Only
 * the open task is ever touched; finished ones are history. Returns the id
 * of a task it created, so the caller can apply goal rules to it.
 */
export async function syncReachOutTask(
  db: Db,
  userId: string,
  personId: string,
  now: Date = newDate()
): Promise<string | null> {
  const person = await db.person.findFirst({ where: { id: personId, userId } });
  const open = await db.task.findFirst({
    where: openTaskWhere(userId, personId),
  });
  const plan = person
    ? planReachOut(person, now, await userTimeZone(db, userId))
    : null;

  if (!plan) {
    if (open) await db.task.delete({ where: { id: open.id } });
    return null;
  }

  const fields = {
    title: plan.title,
    description: plan.description,
    dueDate: plan.dueDate,
    postponedUntil: plan.postponedUntil,
    // Their profile, so Focus can open it.
    externalUrl: person?.link ?? null,
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
      source: PEOPLE_SOURCE,
      externalTaskId: personId,
      duration: 15,
      priority: "medium",
      category: "PERSONAL",
      // Task sync to Google/Outlook never takes these.
      skipSync: true,
    },
  });
  return created.id;
}

export interface InteractionInput {
  at: Date;
  kind: string;
  note: string | null;
}

/**
 * Logs a conversation. One that happened while the reach-out task was open
 * is that check-in, so the task is finished (and earns its XP). An older one
 * is history being filled in: the open task stays open and only its due
 * date moves. Either way the next check-in is planned from the latest
 * conversation.
 */
export async function logInteraction(
  userId: string,
  personId: string,
  input: InteractionInput
) {
  const now = newDate();
  const result = await prisma.$transaction(async (tx) => {
    const person = await tx.person.findFirst({
      where: { id: personId, userId },
    });
    if (!person) return null;
    const interaction = await tx.interaction.create({
      data: { personId, at: input.at, kind: input.kind, note: input.note },
    });
    if (!person.lastContactAt || input.at > person.lastContactAt) {
      await tx.person.update({
        where: { id: personId },
        data: { lastContactAt: input.at },
      });
    }
    const open = await tx.task.findFirst({
      where: openTaskWhere(userId, personId),
    });
    if (open && input.at >= open.createdAt) {
      await tx.task.update({
        where: { id: open.id },
        data: { status: "completed", completedAt: now, syncStatus: LOGGED },
      });
    }
    const nextId = await syncReachOutTask(tx, userId, personId, now);
    return { interaction, nextId };
  });
  if (result?.nextId) {
    await tasksChanged(prisma, userId, [result.nextId]);
  }
  return result?.interaction ?? null;
}

/**
 * Reach-outs finished outside the People page become conversations ("done",
 * dated when the task was finished), and each gets its next check-in. Run
 * by the sync loop for everyone with People on; cheap when there's nothing.
 */
export async function reconcileReachOuts(userId: string): Promise<number> {
  const unlogged = {
    userId,
    source: PEOPLE_SOURCE,
    status: "completed",
    OR: [{ syncStatus: null }, { syncStatus: { not: LOGGED } }],
  };
  const finished = await prisma.task.findMany({
    where: unlogged,
    select: { id: true, externalTaskId: true, completedAt: true },
  });

  const now = newDate();
  const created: string[] = [];
  for (const task of finished) {
    const at = task.completedAt ?? now;
    const nextId = await prisma.$transaction(async (tx) => {
      // Claim the task first: of two passes that saw it at once, only one
      // gets to log it.
      const claimed = await tx.task.updateMany({
        where: { ...unlogged, id: task.id },
        data: { syncStatus: LOGGED },
      });
      if (claimed.count === 0) return null;
      const person = task.externalTaskId
        ? await tx.person.findFirst({
            where: { id: task.externalTaskId, userId },
          })
        : null;
      if (!person) return null;
      await tx.interaction.create({
        data: { personId: person.id, at, kind: "done", note: null },
      });
      if (!person.lastContactAt || at > person.lastContactAt) {
        await tx.person.update({
          where: { id: person.id },
          data: { lastContactAt: at },
        });
      }
      return syncReachOutTask(tx, userId, person.id, now);
    });
    if (nextId) created.push(nextId);
  }
  if (created.length > 0) {
    await tasksChanged(prisma, userId, created);
  }
  return finished.length;
}
