"use client";

import { useMemo } from "react";

import { useTaskListViewSettings } from "@/store/taskListViewSettings";

import type { Task } from "@/types/task";

import { applyLensFilters, withLensFilterFields } from "../lens";
import { useTasksLenses } from "../use-tasks-lenses";
import {
  groupTasksByParent,
  taskMatchesListMode,
} from "../utils/task-list-utils";
import { TASK_FILTER_FIELDS, type TaskFilterField } from "./fields";
import { type FilterScope, parentMatchesListFilters } from "./match";

export interface VisibleTasks extends FilterScope {
  /** What this surface filters by: the core's fields and those of the
   *  modules that are on, less any the surface leaves out. */
  fields: TaskFilterField[];
  /** The rows that pass, unsorted. */
  visible: Task[];
}

const NONE: readonly string[] = [];

/**
 * The Tasks page's one filtering pipeline, shared by the list and the board
 * so the two can't disagree about what a filter hides. The board used to
 * keep its own copy, which had no search box or filter control of its own
 * and quietly applied whatever the list had set.
 *
 * Parents only (children nest under theirs and follow them), then the
 * modules' lenses (Ladder: the open goal tab), then the conditions, deferral
 * and search, then the list mode. `omit` takes a field out of both the
 * pipeline and the menu: the board's columns are the statuses.
 */
export function useVisibleTasks(
  tasks: Task[],
  omit: readonly string[] = NONE
): VisibleTasks {
  const lenses = useTasksLenses();
  const conditions = useTaskListViewSettings((s) => s.conditions);
  const search = useTaskListViewSettings((s) => s.search);
  const showDeferred = useTaskListViewSettings((s) => s.showDeferred);
  const mode = useTaskListViewSettings((s) => s.listMode);

  const fields = useMemo(
    () =>
      withLensFilterFields(TASK_FILTER_FIELDS, lenses).filter(
        (f) => !omit.includes(f.id)
      ),
    [lenses, omit]
  );

  const { parents, childrenOf } = useMemo(
    () => groupTasksByParent(tasks),
    [tasks]
  );

  const scoped = useMemo(
    () => applyLensFilters(lenses, parents),
    [lenses, parents]
  );

  const filters = useMemo(
    () => ({ conditions, fields, search, showDeferred }),
    [conditions, fields, search, showDeferred]
  );

  const visible = useMemo(
    () =>
      scoped.filter(
        (task) =>
          parentMatchesListFilters(task, childrenOf[task.id] ?? [], filters) &&
          taskMatchesListMode(task, mode)
      ),
    [scoped, childrenOf, filters, mode]
  );

  return { fields, parents: scoped, childrenOf, filters, mode, visible };
}
