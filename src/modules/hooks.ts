/**
 * Events the core and modules raise for every module to hear (server only).
 */
import type { Db, DbTransaction } from "@/lib/prisma";

import { MODULES } from "@/modules";
import { SERVER_MODULES } from "@/modules/server";

/**
 * Some of a person's tasks were created or changed (all of them when
 * `taskIds` is missing): each module gets to keep its own data in step —
 * Ladder links them to the goals that claim them. It runs whether or not a
 * module is on, so turning one back on finds its data consistent.
 */
export async function tasksChanged(
  db: Db | DbTransaction,
  userId: string,
  taskIds?: string[]
): Promise<void> {
  if (taskIds && taskIds.length === 0) return;
  for (const m of MODULES) {
    await SERVER_MODULES[m.id].afterTasksChange?.(db, userId, taskIds);
  }
}
