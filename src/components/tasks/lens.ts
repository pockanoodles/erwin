/**
 * What a module adds to the Tasks page: the list, the board and the sheet.
 * Each module that adds anything has a `useTasksLens` hook in the client
 * registry (src/modules/client.tsx), which hands back its lens while it's on
 * and null while it's off. Ladder narrows the page to a Lord and pins its
 * bosses above the sheet; Courses adds the Mat column. The page knows
 * neither: it asks for the lenses (use-tasks-lenses.ts) and uses what they
 * give.
 */
import type { ComponentType, ReactNode } from "react";

import type { TaskColumnId } from "@/store/taskListViewSettings";

import type { Task } from "@/types/task";

import type { TaskColumn, TaskPatch } from "./datasheet/columns";

/** Props of a module's control on a task's row toolbar or board card. */
export interface TaskControlProps {
  task: Task;
  onPatch: (patch: TaskPatch) => void;
  /** The row toolbar's button, or a board card's quiet chip. */
  variant: "toolbar" | "card";
}

/** How the sheet marks a row a module pinned, in place of a row number. */
export interface RowMark {
  /** The gutter's glyph ("⚔"). */
  glyph: string;
  /** The gutter's tooltip ("Boss: Test 2"). */
  title: string;
  /** Drawn above the row's pane (Ladder: the boss strip). */
  strip?: () => ReactNode;
}

/** Something of a module's own pinned in the sheet (Ladder: an unbound boss). */
export interface BandItem {
  key: string;
  mark: RowMark;
  /** Struck through like finished work (Ladder: a felled boss). */
  done: boolean;
  /** Its cell in a column; null where it has nothing to say. */
  cell: (column: TaskColumnId) => ReactNode;
  /** That cell's full text, for the value bar and the tooltip. */
  text: (column: TaskColumnId) => string;
  /** The pane beside the sheet while it's selected. */
  pane: () => ReactNode;
}

/** A row a module pins above the sheet's tasks. */
export type BandRow =
  /** One of the tasks, pulled up into the band (Ladder: a boss's own assignment). */
  | { kind: "task"; task: Task; mark: RowMark }
  | { kind: "item"; item: BandItem };

export interface TasksLens {
  /** Narrows the list and the board (Ladder: to the open Lord's tab). */
  filter?: <T extends Task>(tasks: T[]) => T[];
  /** A strip of tabs along the bottom of the page (Ladder: one per Lord). */
  Tabs?: ComponentType;
  /** The goal a task made from this view starts linked to (Ladder: the open Lord). */
  newTaskGoalId?: string;
  /** Columns the sheet offers, each placed after a core column (`after`). */
  columns?: TaskColumn[];
  /** A short word on a task's row (Ladder: its Lord). */
  rowLabel?: (task: Task) => string | null;
  /** A control on a task's row toolbar and board card (Ladder: the Lord picker). */
  Control?: ComponentType<TaskControlProps>;
  /** Rows pinned above the sheet's tasks, from the tasks in view (Ladder: bosses). */
  band?: (
    tasks: Task[],
    view: { search?: string; showDone: boolean }
  ) => BandRow[];
}

/** The core columns, with each lens's columns placed after their anchors. */
export function withLensColumns(
  core: readonly TaskColumn[],
  lenses: TasksLens[]
): TaskColumn[] {
  const extra = lenses.flatMap((l) => l.columns ?? []);
  const placed = core.flatMap((c) => [
    c,
    ...extra.filter((e) => e.after === c.id),
  ]);
  return [
    ...placed,
    ...extra.filter((e) => !core.some((c) => c.id === e.after)),
  ];
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

export function lensBand(
  lenses: TasksLens[],
  tasks: Task[],
  view: { search?: string; showDone: boolean }
): BandRow[] {
  return lenses.flatMap((l) => l.band?.(tasks, view) ?? []);
}
