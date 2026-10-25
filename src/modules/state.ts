/**
 * Which modules a person has on, read from `UserModule` (server only: this
 * imports Prisma, so nothing the browser loads may import it). No Next.js
 * imports, so the sync worker can use it too; the API's 409 lives in
 * `src/modules/api.ts`.
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  hiddenSourcesOf,
  moduleById,
  nextPosition,
  resolveModuleStates,
} from "@/modules";
import type { ModuleId, ModuleState } from "@/modules/types";

export async function loadModuleStates(userId: string): Promise<ModuleState[]> {
  const rows = await prisma.userModule.findMany({
    where: { userId },
    select: { moduleId: true, enabled: true, position: true },
  });
  return resolveModuleStates(rows);
}

export async function isModuleOn(
  userId: string,
  id: ModuleId
): Promise<boolean> {
  const states = await loadModuleStates(userId);
  return states.some((s) => s.id === id && s.on);
}

/**
 * Everything a request needs to know about one person's modules, from one
 * query: the task sources to hide and whether a given module is on.
 */
export async function moduleView(userId: string): Promise<{
  hidden: string[];
  isOn: (id: ModuleId) => boolean;
}> {
  const states = await loadModuleStates(userId);
  return {
    hidden: hiddenSourcesOf(states),
    isOn: (id) => states.some((s) => s.id === id && s.on),
  };
}

/** Everyone who has a module on, for work that runs per person (module jobs). */
export async function usersWithModuleOn(id: ModuleId): Promise<string[]> {
  if (moduleById(id).defaultOn) {
    const [users, off] = await Promise.all([
      prisma.user.findMany({ select: { id: true } }),
      prisma.userModule.findMany({
        where: { moduleId: id, enabled: false },
        select: { userId: true },
      }),
    ]);
    const offIds = new Set(off.map((r) => r.userId));
    return users.map((u) => u.id).filter((userId) => !offIds.has(userId));
  }
  const rows = await prisma.userModule.findMany({
    where: { moduleId: id, enabled: true },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/** Task sources this person's modules hide (see `hiddenSourcesOf`). */
export async function hiddenTaskSources(userId: string): Promise<string[]> {
  return hiddenSourcesOf(await loadModuleStates(userId));
}

/**
 * A task filter that drops tasks from modules that are off. A task with no
 * source (made by hand) always stays, which is why this can't be a plain
 * `notIn`: SQL's NOT IN drops nulls too.
 */
export function visibleSourceWhere(
  hidden: readonly string[]
): Prisma.TaskWhereInput {
  if (hidden.length === 0) return {};
  return { OR: [{ source: null }, { source: { notIn: [...hidden] } }] };
}

/**
 * Turns a module on or off, or moves it in the rail. Turning one on for the
 * first time puts it at the end of the rail. Turning one off never deletes
 * anything it stored.
 */
export async function updateModule(
  userId: string,
  id: ModuleId,
  change: { on?: boolean; position?: number }
): Promise<ModuleState[]> {
  const states = await loadModuleStates(userId);
  const current = states.find((s) => s.id === id);
  const turningOn = change.on === true && !current?.on;
  const position =
    change.position ??
    (turningOn
      ? nextPosition(states.filter((s) => s.on && s.id !== id))
      : current?.position) ??
    0;
  const enabled = change.on ?? current?.on ?? moduleById(id).defaultOn;

  await prisma.userModule.upsert({
    where: { userId_moduleId: { userId, moduleId: id } },
    create: { userId, moduleId: id, enabled, position },
    update: { enabled, position },
  });
  return loadModuleStates(userId);
}
