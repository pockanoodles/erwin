import {
  addDays,
  format,
  isFutureDate,
  isThisWeek,
  isThisYear,
  isToday,
  isTomorrow,
  newDate,
  newDateFromYMD,
  startOfDay,
} from "@/lib/date-utils";

import {
  EnergyLevel,
  Priority,
  Task,
  TaskListMode,
  TaskStatus,
  TimePreference,
} from "@/types/task";

/**
 * A task is "upcoming" when it has a start date that falls on a later calendar
 * day than today. This is the single source of truth shared by the Tasks list
 * "Hide upcoming tasks" filter and the "Upcoming" badge, so the two can never
 * disagree about which tasks are upcoming. Uses day-granularity (`isFutureDate`)
 * rather than an instant comparison, so a task starting later today is not
 * treated as upcoming.
 */
export const isUpcomingTask = (task: Pick<Task, "startDate">): boolean => {
  return Boolean(task.startDate) && isFutureDate(task.startDate ?? null);
};

/**
 * A task is deferred when `postponedUntil` is still in the future. Instant
 * comparison, not day-granularity: Focus skip-style "in 3 hours" and a
 * calendar-day defer both hide until that moment. `startDate` is the
 * scheduler's earliest-work field (Outlook/Google sync) and is not a hide
 * signal — TaskRow Defer writes `postponedUntil`.
 */
export const isDeferredTask = (
  task: Pick<Task, "postponedUntil">,
  now: Date = newDate()
): boolean => {
  if (!task.postponedUntil) return false;
  return newDate(task.postponedUntil).getTime() > now.getTime();
};

/**
 * Short label for a defer stamp: "Later today", "Tomorrow", or the same
 * contextual date the due column uses.
 */
export const formatDeferLabel = (value: Date | string): string => {
  const d = newDate(value);
  if (isToday(d)) return "Later today";
  if (isTomorrow(d)) return "Tomorrow";
  return formatContextualDate(d).text;
};

// Filter settings consumed by the Tasks list view (subset of
// useTaskListViewSettings relevant to per-task filtering).
export interface TaskListFilterSettings {
  status?: TaskStatus[];
  energyLevel?: EnergyLevel[];
  timePreference?: TimePreference[];
  tagIds?: string[];
  search?: string;
  hideUpcomingTasks?: boolean;
  /** When false/undefined, tasks with a future postponedUntil are hidden. */
  showDeferred?: boolean;
}

/**
 * Decide whether a single task passes the current Tasks list filters. Pure and
 * unit-testable; the list component maps this over the (project-filtered) tasks.
 */
export const taskMatchesListFilters = (
  task: Task,
  filters: TaskListFilterSettings
): boolean => {
  const { status, energyLevel, timePreference, tagIds, search } = filters;

  // Status filter
  if (status?.length && !status.includes(task.status)) {
    return false;
  }

  // Hide upcoming (future-day) tasks
  if (filters.hideUpcomingTasks && isUpcomingTask(task)) {
    return false;
  }

  // Hide deferred tasks unless the user asked to see them or searched.
  if (isDeferredTask(task) && !filters.showDeferred && !filters.search) {
    return false;
  }

  // Energy level filter
  if (
    energyLevel?.length &&
    (!task.energyLevel || !energyLevel.includes(task.energyLevel))
  ) {
    return false;
  }

  // Time preference filter
  if (
    timePreference?.length &&
    (!task.preferredTime || !timePreference.includes(task.preferredTime))
  ) {
    return false;
  }

  // Tags filter
  if (tagIds?.length) {
    const taskTagIds = task.tags.map((t) => t.id);
    if (!tagIds.some((id) => taskTagIds.includes(id))) {
      return false;
    }
  }

  // Search
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
 * Split a flat task list into top-level parents and children keyed by parent.
 * Children sort by `order`, then createdAt. Orphan children (parent missing
 * from the list) are dropped so they cannot render as top-level rows.
 */
export const groupTasksByParent = (
  tasks: Task[]
): { parents: Task[]; childrenOf: Record<string, Task[]> } => {
  const childrenOf: Record<string, Task[]> = {};
  const parents: Task[] = [];
  for (const task of tasks) {
    if (task.parentTaskId) {
      const list = childrenOf[task.parentTaskId] ?? [];
      list.push(task);
      childrenOf[task.parentTaskId] = list;
    } else {
      parents.push(task);
    }
  }
  for (const list of Object.values(childrenOf)) {
    list.sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return newDate(a.createdAt).getTime() - newDate(b.createdAt).getTime();
    });
  }
  return { parents, childrenOf };
};

/**
 * A parent row is visible if it matches the list filters, or if the user is
 * searching and one of its children matches the query (so a hidden parent
 * still surfaces when you search for a subtask title).
 */
export const parentMatchesListFilters = (
  parent: Task,
  children: Task[],
  filters: TaskListFilterSettings
): boolean => {
  if (taskMatchesListFilters(parent, filters)) return true;
  if (!filters.search) return false;
  const searchLower = filters.search.toLowerCase();
  return children.some(
    (child) =>
      child.title.toLowerCase().includes(searchLower) ||
      (child.description?.toLowerCase().includes(searchLower) ?? false)
  );
};

/**
 * Query modes on `/tasks`. These slice the inventory by due date. They are
 * not Focus — no ranking, no suggested lane. `dueDate` is stored at UTC
 * midnight; rebuild locally from the UTC calendar day so US zones don't
 * shift the bucket.
 */
export type { TaskListMode } from "@/types/task";

export const TASK_LIST_MODES: readonly TaskListMode[] = [
  "all",
  "today",
  "upcoming",
  "someday",
];

export function parseTaskListMode(value: string | null): TaskListMode | null {
  if (value && (TASK_LIST_MODES as readonly string[]).includes(value)) {
    return value as TaskListMode;
  }
  return null;
}

/**
 * Local midnight for a task due stamp (UTC Y/M/D rebuilt in local time).
 */
export const dueDateAsLocalDay = (due: Date | string): Date => {
  const d = newDate(due);
  return newDateFromYMD(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * Whether a parent row belongs in the current list mode. Completed status
 * is a separate filter. Subtasks are grouped under their parent, not sliced
 * here.
 */
export const taskMatchesListMode = (
  task: Pick<Task, "dueDate">,
  mode: TaskListMode,
  now: Date = newDate()
): boolean => {
  if (mode === "all") return true;
  const today = startOfDay(now);
  if (!task.dueDate) return mode === "someday";
  if (mode === "someday") return false;
  const due = dueDateAsLocalDay(task.dueDate);
  if (mode === "today") {
    return due.getTime() <= today.getTime();
  }
  const start = addDays(today, 1);
  const end = addDays(today, 7);
  return due.getTime() >= start.getTime() && due.getTime() <= end.getTime();
};

export interface TaskListGroup {
  key: string;
  label: string | null;
  tasks: Task[];
}

/**
 * Band the already-filtered/sorted parents. Today splits Overdue / Today.
 * Upcoming is one band per day for the next 7 days (empty days omitted).
 * All and Someday stay a single unlabeled list.
 */
export const groupTasksForListMode = (
  tasks: Task[],
  mode: TaskListMode,
  now: Date = newDate()
): TaskListGroup[] => {
  if (mode === "today") {
    const today = startOfDay(now);
    const overdue: Task[] = [];
    const dueToday: Task[] = [];
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const due = dueDateAsLocalDay(task.dueDate);
      if (due.getTime() < today.getTime()) overdue.push(task);
      else dueToday.push(task);
    }
    const groups: TaskListGroup[] = [];
    if (overdue.length > 0) {
      groups.push({ key: "overdue", label: "Overdue", tasks: overdue });
    }
    if (dueToday.length > 0) {
      groups.push({ key: "today", label: "Today", tasks: dueToday });
    }
    return groups;
  }

  if (mode === "upcoming") {
    const today = startOfDay(now);
    const groups: TaskListGroup[] = [];
    for (let offset = 1; offset <= 7; offset += 1) {
      const day = addDays(today, offset);
      const dayTasks = tasks.filter((task) => {
        if (!task.dueDate) return false;
        return dueDateAsLocalDay(task.dueDate).getTime() === day.getTime();
      });
      if (dayTasks.length === 0) continue;
      groups.push({
        key: format(day, "yyyy-MM-dd"),
        label: offset === 1 ? "Tomorrow" : format(day, "EEEE"),
        tasks: dayTasks,
      });
    }
    return groups;
  }

  return [{ key: mode, label: null, tasks }];
};

export const emptyListModeMessage = (mode: TaskListMode): string => {
  if (mode === "today") return "Nothing due today.";
  if (mode === "upcoming") return "Nothing due in the next 7 days.";
  if (mode === "someday") return "No undated tasks.";
  return "No tasks match.";
};

// Helper function to format enum values for display
export const formatEnumValue = (value: string) => {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const statusColors = {
  [TaskStatus.TODO]: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  [TaskStatus.IN_PROGRESS]: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  [TaskStatus.COMPLETED]: "bg-green-500/20 text-green-700 dark:text-green-400",
};

export const energyLevelColors = {
  high: "bg-red-500/20 text-red-700 dark:text-red-400",
  medium: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
  low: "bg-green-500/20 text-green-700 dark:text-green-400",
};

export const timePreferenceColors = {
  [TimePreference.MORNING]: "bg-sky-500/20 text-sky-700 dark:text-sky-400",
  [TimePreference.AFTERNOON]:
    "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  [TimePreference.EVENING]:
    "bg-indigo-500/20 text-indigo-700 dark:text-indigo-400",
};

export const priorityColors = {
  [Priority.HIGH]: "bg-red-500/20 text-red-700 dark:text-red-400",
  [Priority.MEDIUM]: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
  [Priority.LOW]: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  [Priority.NONE]: "bg-muted text-muted-foreground",
};

// Semantic rank for the Priority column so the Tasks list sorts by meaning
// (low < medium < high) instead of alphabetically by the enum label.
// Priority.NONE is intentionally omitted: the app represents "no priority" as
// BOTH null (an untouched modal) and the literal "none" (explicit select), so
// both must bucket last together rather than "none" sorting among real values.
// An omitted key makes rankOf return undefined, which compareRanks sorts last.
export const PRIORITY_SORT_RANK: Partial<Record<Priority, number>> = {
  [Priority.LOW]: 1,
  [Priority.MEDIUM]: 2,
  [Priority.HIGH]: 3,
};

// Semantic rank for the Energy column (low < medium < high).
export const ENERGY_LEVEL_SORT_RANK: Partial<Record<EnergyLevel, number>> = {
  [EnergyLevel.LOW]: 1,
  [EnergyLevel.MEDIUM]: 2,
  [EnergyLevel.HIGH]: 3,
};

// Look up a value's rank in a rank map, returning undefined for missing values
// AND for any value not present in the map. The DB stores priority/energyLevel
// as plain strings, so a stale or externally-imported value (e.g. "urgent")
// can reach the comparator; we treat such unknown values like a missing value
// rather than producing NaN.
const rankOf = (
  value: string | null | undefined,
  ranks: Partial<Record<string, number>>
): number | undefined => {
  if (value == null) return undefined;
  // Use an own-property check so prototype keys ("toString", "__proto__", ...)
  // don't resolve to an inherited property; an unknown string is treated like a
  // missing one. hasOwnProperty.call avoids depending on Object.hasOwn at
  // runtime and on the value owning its own hasOwnProperty.
  return Object.prototype.hasOwnProperty.call(ranks, value)
    ? ranks[value]
    : undefined;
};

// Compare two rank lookups so missing/unknown values always sort last,
// regardless of direction (matching the other nullable columns), and two
// missing/unknown values compare equal (stable). `direction` is 1 (asc) or -1
// (desc).
const compareRanks = (
  rankA: number | undefined,
  rankB: number | undefined,
  direction: number
): number => {
  if (rankA === undefined && rankB === undefined) return 0;
  if (rankA === undefined) return 1;
  if (rankB === undefined) return -1;
  return direction * (rankA - rankB);
};

// Comparator for sorting tasks by priority rank. `direction` is 1 (asc) or -1
// (desc), matching how the Tasks list applies its sort direction. Tasks with no
// priority (or an unrecognized value) always sort last, regardless of
// direction, like the other nullable columns.
export const compareTaskPriority = (
  a: Pick<Task, "priority">,
  b: Pick<Task, "priority">,
  direction: number
): number =>
  compareRanks(
    rankOf(a.priority, PRIORITY_SORT_RANK),
    rankOf(b.priority, PRIORITY_SORT_RANK),
    direction
  );

// Comparator for sorting tasks by energy-level rank. Same direction and
// missing/unknown-last semantics as compareTaskPriority.
export const compareTaskEnergyLevel = (
  a: Pick<Task, "energyLevel">,
  b: Pick<Task, "energyLevel">,
  direction: number
): number =>
  compareRanks(
    rankOf(a.energyLevel, ENERGY_LEVEL_SORT_RANK),
    rankOf(b.energyLevel, ENERGY_LEVEL_SORT_RANK),
    direction
  );

/**
 * A task date as a column-width label: "Today", "Tomorrow", "Friday",
 * "Mar 10", "Overdue: Aug 31".
 *
 * Task dates are stored at UTC midnight, so reading them in local time lands
 * on 8:00 PM the day before (or noon, depending on the zone) and printing the
 * clock shows that artifact as if it were data. Take the UTC calendar date and
 * rebuild it locally. There were three copies of this — two correct ones
 * pasted into cell components and this exported one, which had drifted into
 * printing the phantom time; the copies now import this.
 */
export const formatContextualDate = (date: Date) => {
  const localDate = newDateFromYMD(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  const now = newDate();
  now.setHours(0, 0, 0, 0);

  const isOverdue = localDate < now && !isToday(localDate);
  const isFuture = isFutureDate(localDate);

  let text: string;
  if (isToday(localDate)) {
    text = "Today";
  } else if (isTomorrow(localDate)) {
    text = "Tomorrow";
  } else if (isThisWeek(localDate)) {
    text = format(localDate, "EEEE");
  } else if (isThisYear(localDate)) {
    text = format(localDate, "MMM d");
  } else {
    text = format(localDate, "MMM d, yyyy");
  }
  if (isOverdue) {
    text = `Overdue: ${text}`;
  }

  return { text, isOverdue, isFuture };
};
