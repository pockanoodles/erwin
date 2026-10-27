/**
 * Whether a task passes the Tasks page's filters: the menu's conditions,
 * deferral and search. The list, the board and the menu's counts all ask
 * here, so none of them can disagree about what a filter hides. Pure.
 */
import type {
  FilterCondition,
  TaskFilterConditions,
} from "@/store/taskListViewSettings";

import type { Task, TaskListMode } from "@/types/task";

import { isDeferredTask, taskMatchesListMode } from "../utils/task-list-utils";
import {
  type FilterOption,
  TASK_FILTER_FIELDS,
  type TaskFilterField,
} from "./fields";

export interface TaskListFilterSettings {
  conditions?: TaskFilterConditions;
  /** The fields the conditions name; the core's when left out. A condition on
   *  a field that isn't here (its module is off) is ignored. */
  fields?: readonly TaskFilterField[];
  search?: string;
  /** When false/undefined, tasks with a future postponedUntil are hidden. */
  showDeferred?: boolean;
}

/** A condition that narrows anything: one with a value picked. */
export const isActiveCondition = (
  condition: FilterCondition | undefined
): condition is FilterCondition => Boolean(condition?.values.length);

export function taskPassesCondition(
  task: Task,
  field: TaskFilterField,
  condition: FilterCondition | undefined
): boolean {
  if (!isActiveCondition(condition)) return true;
  const hit = field.values(task).some((v) => condition.values.includes(v));
  return condition.exclude ? !hit : hit;
}

/**
 * Decide whether a single task passes the current filters. `skip` leaves one
 * field's condition out, which is how the menu counts what each of a field's
 * values would leave with every other filter in place.
 */
export const taskMatchesListFilters = (
  task: Task,
  filters: TaskListFilterSettings,
  skip?: string
): boolean => {
  const { conditions = {}, fields = TASK_FILTER_FIELDS, search } = filters;

  // Hide deferred tasks unless the user asked to see them or searched.
  if (isDeferredTask(task) && !filters.showDeferred && !search) {
    return false;
  }

  for (const field of fields) {
    if (field.id === skip) continue;
    if (!taskPassesCondition(task, field, conditions[field.id])) return false;
  }

  if (search) {
    const searchLower = search.toLowerCase();
    return (
      task.title.toLowerCase().includes(searchLower) ||
      (task.description?.toLowerCase().includes(searchLower) ?? false) ||
      task.tags.some((tag) => tag.name.toLowerCase().includes(searchLower))
    );
  }

  return true;
};

/**
 * A parent row is visible if it matches the list filters, or if the user is
 * searching and one of its children matches the query (so a hidden parent
 * still surfaces when you search for a subtask title).
 */
export const parentMatchesListFilters = (
  parent: Task,
  children: Task[],
  filters: TaskListFilterSettings,
  skip?: string
): boolean => {
  if (taskMatchesListFilters(parent, filters, skip)) return true;
  if (!filters.search) return false;
  const searchLower = filters.search.toLowerCase();
  return children.some(
    (child) =>
      child.title.toLowerCase().includes(searchLower) ||
      (child.description?.toLowerCase().includes(searchLower) ?? false)
  );
};

/** What the menu's counts are taken over: the rows before any filter, and
 *  everything that narrows them. */
export interface FilterScope {
  parents: readonly Task[];
  childrenOf: Record<string, Task[]>;
  filters: TaskListFilterSettings;
  mode: TaskListMode;
}

/**
 * How many rows carry each of a field's values once every other filter has
 * had its say, the list mode included: what picking a value would leave, or
 * under "is not" take away. Excel's AutoFilter counts the same way.
 */
export function countOptions(
  field: TaskFilterField,
  { parents, childrenOf, filters, mode }: FilterScope
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of parents) {
    if (!taskMatchesListMode(task, mode)) continue;
    if (
      !parentMatchesListFilters(
        task,
        childrenOf[task.id] ?? [],
        filters,
        field.id
      )
    ) {
      continue;
    }
    for (const value of new Set(field.values(task))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

/** Deferred rows that every other filter lets through: what "Show" adds. */
export function countDeferred({
  parents,
  childrenOf,
  filters,
  mode,
}: FilterScope): number {
  const shown = { ...filters, showDeferred: true };
  return parents.filter(
    (task) =>
      isDeferredTask(task) &&
      taskMatchesListMode(task, mode) &&
      parentMatchesListFilters(task, childrenOf[task.id] ?? [], shown)
  ).length;
}

/**
 * A field's options plus any picked value they no longer carry (a course that
 * ended, a tag that was deleted), so a stale pick can still be seen and
 * unpicked rather than filtering silently.
 */
export function optionsWithPicked(
  options: FilterOption[],
  condition: FilterCondition | undefined
): FilterOption[] {
  const missing = (condition?.values ?? []).filter(
    (value) => !options.some((o) => o.value === value)
  );
  return [...options, ...missing.map((value) => ({ value, label: value }))];
}

/** "Status is Todo, In Progress": a condition as one line. */
export function describeCondition(
  field: TaskFilterField,
  condition: FilterCondition,
  options: FilterOption[]
): string {
  const labels = options
    .filter((o) => condition.values.includes(o.value))
    .map((o) => o.label);
  return `${field.label} ${condition.exclude ? "is not" : "is"} ${labels.join(", ")}`;
}

/** Same picks, order aside. */
export function sameConditions(
  a: TaskFilterConditions,
  b: TaskFilterConditions
): boolean {
  const keys = (c: TaskFilterConditions) =>
    Object.keys(c).filter((k) => isActiveCondition(c[k]));
  const ka = keys(a);
  if (ka.length !== keys(b).length) return false;
  return ka.every((k) => {
    const x = a[k];
    const y = b[k];
    return (
      isActiveCondition(y) &&
      Boolean(x.exclude) === Boolean(y.exclude) &&
      x.values.length === y.values.length &&
      x.values.every((v) => y.values.includes(v))
    );
  });
}
