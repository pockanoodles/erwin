/**
 * What Training tells the core about its tasks (server only). Goals can
 * claim one routine's workouts with `routine:<id>`, beside the whole TRAINING
 * source.
 */
import type { Db, DbTransaction } from "@/lib/prisma";

import { TRAINING_SOURCE } from "@/modules/training/workout";
import type { ClaimOption } from "@/modules/types";

/** Each workout task's routine, as a key a goal can claim. */
export async function routineClaimKeys(
  db: Db | DbTransaction,
  userId: string,
  taskIds: string[]
): Promise<Map<string, string[]>> {
  const tasks = await db.task.findMany({
    where: {
      id: { in: taskIds },
      userId,
      source: TRAINING_SOURCE,
      externalTaskId: { not: null },
    },
    select: { id: true, externalTaskId: true },
  });
  return new Map(
    tasks.map((t) => [t.id, [`routine:${t.externalTaskId}`]] as const)
  );
}

/**
 * Each routine, for a goal to claim its workouts. Archived ones stay
 * offered, so a goal that already claims one can still be saved.
 */
export async function routineClaimOptions(
  db: Db,
  userId: string
): Promise<ClaimOption[]> {
  const routines = await db.routine.findMany({
    where: { userId },
    select: { id: true, name: true, archived: true },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });
  return routines.map((r) => ({
    key: `routine:${r.id}`,
    label: r.archived ? `${r.name} (archived)` : r.name,
    title: `Every ${r.name} session`,
  }));
}
