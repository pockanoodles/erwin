"use client";

import { useMemo } from "react";

import { MODULES } from "@/modules";
import { CLIENT_MODULES } from "@/modules/client";

import type { TasksLens } from "./lens";

// Read on first use, not at import: the registry imports module components,
// and those import parts of the Tasks page that import this file.
let lensHooks: Array<() => TasksLens | null> | null = null;
const lensHooksOf = () =>
  (lensHooks ??= MODULES.flatMap((m) => {
    const useLens = CLIENT_MODULES[m.id].useTasksLens;
    return useLens ? [useLens] : [];
  }));

const onlyOn = (lenses: (TasksLens | null)[]) =>
  lenses.filter((l): l is TasksLens => l !== null);

/** The lenses of the modules that are on, in the registry's order. */
export function useTasksLenses(): TasksLens[] {
  // One hook per module that has one, in the same order on every render.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const perModule = lensHooksOf().map((useLens) => useLens());
  // A fixed-length list, so the memo only moves when a module's lens does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => onlyOn(perModule), perModule);
}
