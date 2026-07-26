import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ssrSafeJsonStorage } from "@/lib/storage/ssr-safe-json-storage";

import { EnergyLevel, TaskStatus, TimePreference } from "@/types/task";

export type TaskColumnId =
  | "status"
  | "title"
  | "priority"
  | "energyLevel"
  | "preferredTime"
  | "dueDate"
  | "duration"
  | "lord"
  | "schedule"
  | "startDate";

/** Daily-scan columns. Energy/Time/Start date are auto-scheduler inputs and
 *  live behind the Columns picker by default. */
export const DEFAULT_VISIBLE_COLUMNS: TaskColumnId[] = [
  "status",
  "title",
  "priority",
  "dueDate",
  "duration",
  "lord",
  "schedule",
];

interface TaskListViewSettings {
  // Sort settings ("project" is the legacy name for "lord" in persisted state)
  sortBy:
    | "dueDate"
    | "startDate"
    | "title"
    | "status"
    | "lord"
    | "project"
    | "schedule"
    | "priority"
    | "energyLevel"
    | "preferredTime"
    | "duration";
  sortDirection: "asc" | "desc";

  // Filter settings
  status?: TaskStatus[];
  energyLevel?: EnergyLevel[];
  timePreference?: TimePreference[];
  tagIds?: string[];
  search?: string;
  hideUpcomingTasks?: boolean;

  // Column visibility ("title" is always visible and not stored)
  visibleColumns: TaskColumnId[];

  // Actions
  setSortBy: (sortBy: TaskListViewSettings["sortBy"]) => void;
  setSortDirection: (direction: TaskListViewSettings["sortDirection"]) => void;
  setFilters: (
    filters: Partial<
      Omit<
        TaskListViewSettings,
        | "setSortBy"
        | "setSortDirection"
        | "setFilters"
        | "resetFilters"
        | "toggleColumn"
      >
    >
  ) => void;
  resetFilters: () => void;
  toggleColumn: (column: TaskColumnId) => void;
}

const DEFAULT_STATUS_FILTERS = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];

export const useTaskListViewSettings = create<TaskListViewSettings>()(
  persist(
    (set) => ({
      // Initial sort settings
      sortBy: "dueDate",
      sortDirection: "desc",

      // Initial filter settings
      status: DEFAULT_STATUS_FILTERS,
      energyLevel: undefined,
      timePreference: undefined,
      tagIds: undefined,
      search: undefined,
      hideUpcomingTasks: false,

      visibleColumns: DEFAULT_VISIBLE_COLUMNS,

      // Actions
      setSortBy: (sortBy) => set({ sortBy }),
      setSortDirection: (sortDirection) => set({ sortDirection }),
      setFilters: (filters) => set(filters),
      resetFilters: () =>
        set({
          status: DEFAULT_STATUS_FILTERS,
          energyLevel: undefined,
          timePreference: undefined,
          tagIds: undefined,
          search: undefined,
          hideUpcomingTasks: false,
        }),
      toggleColumn: (column) =>
        set((state) => ({
          visibleColumns: state.visibleColumns.includes(column)
            ? state.visibleColumns.filter((c) => c !== column)
            : [...state.visibleColumns, column],
        })),
    }),
    {
      name: "task-list-view-settings",
      storage: ssrSafeJsonStorage,
    }
  )
);
