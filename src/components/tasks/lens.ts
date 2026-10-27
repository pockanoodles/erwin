/**
 * What a module adds to the Tasks page: the list, the board and the sheet.
 * Each module that adds anything has a `useTasksLens` hook in the client
 * registry (src/modules/client.tsx), which hands back its lens while it's on
 * and null while it's off. Ladder adds a goal tab per top goal and the Goal
 * column; Courses adds the Mat column and the Course and Submission filters.
 * The page knows neither: it asks for the lenses (use-tasks-lenses.ts) and
 * uses what they give.
 */
import type { ComponentType } from "react";

import type { Task } from "@/types/task";

import type { TaskColumn, TaskPatch } from "./datasheet/columns";
import type { TaskFilterField } from "./filters/fields";

/** Props of a module's control on a task's row toolbar or board card. */
export interface TaskControlProps {
  task: Task;
  onPatch: (patch: TaskPatch) => void;
  /** The row toolbar's button, or a board card's quiet chip. */
  variant: "toolbar" | "card";
}

export interface TasksLens {
  /** Narrows the list and the board (Ladder: to the open goal tab). */
  filter?: <T extends Task>(tasks: T[]) => T[];
  /** A strip of tabs along the bottom of the page (Ladder: one per top goal). */
  Tabs?: ComponentType;
  /** The goal a task made from this view starts linked to (Ladder: the open tab's). */
  newTaskGoalId?: string;
  /** Columns the sheet offers, each placed after a core column (`after`). */
  columns?: TaskColumn[];
  /** Fields the filter menu offers, each placed after a core field (`after`). */
  filters?: TaskFilterField[];
  /** A short word on a task's row (Ladder: its goal). */
  rowLabel?: (task: Task) => string | null;
  /** A control on a task's row toolbar and board card (Ladder: the goal picker). */
  Control?: ComponentType<TaskControlProps>;
}

/** A core registry with the modules' entries placed after their anchors, in
 *  lens order; one whose anchor isn't there goes last. */
function placeAfter<T extends { id: string; after?: string }>(
  core: readonly T[],
  extra: T[]
): T[] {
  const placed = core.flatMap((c) => [
    c,
    ...extra.filter((e) => e.after === c.id),
  ]);
  return [
    ...placed,
    ...extra.filter((e) => !core.some((c) => c.id === e.after)),
  ];
}

/** The core columns, with each lens's columns placed after their anchors. */
export function withLensColumns(
  core: readonly TaskColumn[],
  lenses: TasksLens[]
): TaskColumn[] {
  return placeAfter(
    core,
    lenses.flatMap((l) => l.columns ?? [])
  );
}

/** The core filter fields, with each lens's fields placed after their anchors. */
export function withLensFilterFields(
  core: readonly TaskFilterField[],
  lenses: TasksLens[]
): TaskFilterField[] {
  return placeAfter(
    core,
    lenses.flatMap((l) => l.filters ?? [])
  );
}

export function applyLensFilters<T extends Task>(
  lenses: TasksLens[],
  tasks: T[]
): T[] {
  return lenses.reduce(
    (rest, lens) => (lens.filter ? lens.filter(rest) : rest),
    tasks
  );
}
