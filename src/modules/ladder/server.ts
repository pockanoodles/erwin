/**
 * Ladder's server side for the module registry (src/modules/server.ts).
 */
import { applyGoalRules } from "@/lib/erwin/goal-rules";
import type { Db, DbTransaction } from "@/lib/prisma";

/**
 * Tasks were created or changed (all of a person's tasks when `taskIds` is
 * missing): link them to the goals that claim them. Goals' own saves run the
 * rules themselves.
 */
export async function linkChangedTasksToGoals(
  db: Db | DbTransaction,
  userId: string,
  taskIds?: string[]
): Promise<void> {
  await applyGoalRules(db, userId, taskIds ? { taskIds } : {});
}
