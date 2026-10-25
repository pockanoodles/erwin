/**
 * Which modules a person has on, read from `UserModule` (server only: this
 * imports Prisma, so nothing the browser loads may import it).
 */
import { NextResponse } from "next/server";

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
 * What a module's API answers while it's off: a 409 that says so, so a
 * script calling it (ops) fails loudly instead of writing into a module
 * nobody can see. Null when the module is on.
 */
export async function moduleOffResponse(
  userId: string,
  id: ModuleId
): Promise<NextResponse | null> {
  if (await isModuleOn(userId, id)) return null;
  const { name } = moduleById(id);
  return NextResponse.json(
    {
      error: "module_off",
      module: id,
      message: `${name} is off. Turn it on in Modules.`,
    },
    { status: 409 }
  );
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
