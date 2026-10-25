/**
 * What the core asks of every module, and the events it raises for them to
 * hear (server only).
 */
import type { Db, DbTransaction } from "@/lib/prisma";

import { MODULES } from "@/modules";
import {
  type FactsRequest,
  SERVER_MODULES,
  type TaskFacts,
} from "@/modules/server";
import type { ModuleId } from "@/modules/types";

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

/**
 * What the modules a person has on add to these tasks, merged per task.
 * Callers spread an entry onto its task without reading it.
 */
export async function moduleTaskFacts(
  db: Db,
  userId: string,
  tasks: FactsRequest[],
  isOn: (id: ModuleId) => boolean
): Promise<Map<string, TaskFacts>> {
  const merged = new Map<string, TaskFacts>();
  if (tasks.length === 0) return merged;
  for (const m of MODULES) {
    const ask = SERVER_MODULES[m.id].taskFacts;
    if (!ask || !isOn(m.id)) continue;
    for (const [id, facts] of await ask(db, userId, tasks)) {
      merged.set(id, { ...merged.get(id), ...facts });
    }
  }
  return merged;
}

/** The strongest lift any module a person has on gives each task (0–1). */
export async function moduleLift(
  db: Db,
  userId: string,
  taskIds: string[],
  isOn: (id: ModuleId) => boolean
): Promise<Map<string, number>> {
  const best = new Map<string, number>();
  if (taskIds.length === 0) return best;
  for (const m of MODULES) {
    const ask = SERVER_MODULES[m.id].lift;
    if (!ask || !isOn(m.id)) continue;
    for (const [id, lift] of await ask(db, userId, taskIds)) {
      best.set(id, Math.max(best.get(id) ?? lift, lift));
    }
  }
  return best;
}

/** Every key a goal can claim each task by that a module supplies, on or off. */
export async function moduleClaimKeys(
  db: Db | DbTransaction,
  userId: string,
  taskIds: string[]
): Promise<Map<string, string[]>> {
  const keys = new Map<string, string[]>();
  if (taskIds.length === 0) return keys;
  for (const m of MODULES) {
    const ask = SERVER_MODULES[m.id].claimKeys;
    if (!ask) continue;
    for (const [id, more] of await ask(db, userId, taskIds)) {
      keys.set(id, [...(keys.get(id) ?? []), ...more]);
    }
  }
  return keys;
}
