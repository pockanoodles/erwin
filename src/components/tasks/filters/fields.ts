/**
 * What the Tasks page filters by, one description per field: the filter
 * menu's counterpart to the sheet's column registry (datasheet/columns.tsx).
 *
 * A field says which values a task has and which values are on offer, and
 * nothing else. The menu draws every field the same way, the list, the board
 * and the menu's counts run every condition through the same test (match.ts),
 * and a module adds a field through its Tasks lens without the page knowing
 * it: Courses adds Course and Submission. Ids are what's persisted, and a
 * field that has a column shares its id.
 */
import {
  EnergyLevel,
  Priority,
  Task,
  TaskStatus,
  TimePreference,
} from "@/types/task";

import {
  type DueBucket,
  dueBucket,
  formatEnumValue,
  isUpcomingTask,
} from "../utils/task-list-utils";

/** What a task has where it has nothing: no priority, no due date, no tags. */
export const NO_VALUE = "__none__";

export interface FilterOption {
  value: string;
  label: string;
  /** The longer name, on hover (a course's full title). */
  title?: string;
}

export interface TaskFilterField {
  id: string;
  label: string;
  /** The values this task has: one for most fields, one per tag for Tags,
   *  NO_VALUE when it has none. */
  values: (task: Task) => string[];
  /** The values on offer, in order. A fixed field ignores the tasks; an open
   *  one (Course, Tags) lists what they carry. */
  options: (tasks: readonly Task[]) => FilterOption[];
  /** Offers only what the tasks carry, so with one value or none it has
   *  nothing to choose between and stays out of the menu. */
  open?: boolean;
  /** A module's field: the core field it follows in the menu. */
  after?: string;
}

/** A field over one enum, with "None" last when a task can leave it empty. */
function enumField(
  id: string,
  label: string,
  values: readonly string[],
  read: (task: Task) => string | null | undefined,
  noneLabel?: string
): TaskFilterField {
  const options: FilterOption[] = [
    ...values.map((value) => ({ value, label: formatEnumValue(value) })),
    ...(noneLabel ? [{ value: NO_VALUE, label: noneLabel }] : []),
  ];
  return {
    id,
    label,
    values: (task) => [read(task) || NO_VALUE],
    options: () => options,
  };
}

/** An open field's options: what the tasks carry, by label, "none" last. */
function carried(
  tasks: readonly Task[],
  read: (task: Task) => { value: string; label: string; title?: string }[],
  noneLabel: string
): FilterOption[] {
  const seen = new Map<string, FilterOption>();
  let none = false;
  for (const task of tasks) {
    const found = read(task);
    if (found.length === 0) none = true;
    for (const option of found) seen.set(option.value, option);
  }
  return [
    ...[...seen.values()].sort((a, b) => a.label.localeCompare(b.label)),
    ...(none ? [{ value: NO_VALUE, label: noneLabel }] : []),
  ];
}

const DUE_OPTIONS: { value: DueBucket | typeof NO_VALUE; label: string }[] = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "week", label: "Next 7 days" },
  { value: "later", label: "Later" },
  { value: NO_VALUE, label: "No date" },
];

/** Whether a task is on the calendar, and who put it there. */
function scheduleValue(task: Task): string {
  if (task.scheduledStart) return "scheduled";
  return task.isAutoScheduled ? "unscheduled" : "manual";
}

/** Render order. */
export const TASK_FILTER_FIELDS: readonly TaskFilterField[] = [
  enumField("status", "Status", Object.values(TaskStatus), (t) => t.status),
  {
    id: "dueDate",
    label: "Due",
    values: (t) => [dueBucket(t) ?? NO_VALUE],
    options: () => DUE_OPTIONS,
  },
  enumField(
    "priority",
    "Priority",
    [Priority.HIGH, Priority.MEDIUM, Priority.LOW],
    // The app stores "no priority" both as null and as "none".
    (t) => (t.priority === Priority.NONE ? null : t.priority),
    "None"
  ),
  {
    id: "schedule",
    label: "Schedule",
    values: (t) => [scheduleValue(t)],
    options: () => [
      { value: "scheduled", label: "On the calendar" },
      { value: "unscheduled", label: "No slot yet" },
      { value: "manual", label: "Manual" },
    ],
  },
  enumField(
    "energyLevel",
    "Energy",
    Object.values(EnergyLevel),
    (t) => t.energyLevel,
    "None"
  ),
  enumField(
    "preferredTime",
    "Time",
    Object.values(TimePreference),
    (t) => t.preferredTime,
    "None"
  ),
  {
    id: "startDate",
    label: "Start",
    values: (t) => [
      !t.startDate ? NO_VALUE : isUpcomingTask(t) ? "later" : "started",
    ],
    options: () => [
      { value: "started", label: "Started" },
      { value: "later", label: "Starts later" },
      { value: NO_VALUE, label: "No start date" },
    ],
  },
  {
    id: "source",
    label: "Source",
    open: true,
    values: (t) => [t.source || NO_VALUE],
    options: (tasks) =>
      carried(
        tasks,
        (t) =>
          t.source
            ? [{ value: t.source, label: formatEnumValue(t.source) }]
            : [],
        "Sigwald"
      ),
  },
  {
    id: "tags",
    label: "Tags",
    open: true,
    values: (t) => (t.tags.length ? t.tags.map((tag) => tag.id) : [NO_VALUE]),
    options: (tasks) =>
      carried(
        tasks,
        (t) => t.tags.map((tag) => ({ value: tag.id, label: tag.name })),
        "No tags"
      ),
  },
];
