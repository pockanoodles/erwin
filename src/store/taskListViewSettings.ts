import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ssrSafeJsonStorage } from "@/lib/storage/ssr-safe-json-storage";

import { EnergyLevel, TaskListMode, TaskStatus, TimePreference } from "@/types/task";

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
  showDeferred?: boolean;
  /**
   * Inventory query: All / Today / Upcoming / Someday. Not Focus. Default
   * All so existing `/tasks` behavior is unchanged.
   */
  listMode: TaskListMode;

  // Column visibility ("title" is always visible and not stored)
  visibleColumns: TaskColumnId[];

  /**
   * Widths set by dragging a header edge, in px. Only columns the user has
   * actually resized appear here — everything else falls back to the width in
   * the column registry, so changing a default still reaches anyone who never
   * touched that column.
   */
  columnWidths: Partial<Record<TaskColumnId, number>>;

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
        | "setListMode"
        | "listMode"
      >
    >
  ) => void;
  resetFilters: () => void;
  setListMode: (mode: TaskListMode) => void;
  toggleColumn: (column: TaskColumnId) => void;
  setColumnWidth: (column: TaskColumnId, width: number) => void;
  /** Back to the registry default — the double-click on a header edge. */
  resetColumnWidth: (column: TaskColumnId) => void;
}

/** Narrow enough to park a column you rarely read, wide enough to still be
 *  grabbable; the ceiling just stops a runaway drag from stranding the sheet. */
export const MIN_COLUMN_WIDTH = 56;
export const MAX_COLUMN_WIDTH = 900;

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
      showDeferred: false,
      listMode: "all",

      visibleColumns: DEFAULT_VISIBLE_COLUMNS,
      columnWidths: {},

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
          showDeferred: false,
        }),
      setListMode: (listMode) => set({ listMode }),
      toggleColumn: (column) =>
        set((state) => ({
          visibleColumns: state.visibleColumns.includes(column)
            ? state.visibleColumns.filter((c) => c !== column)
            : [...state.visibleColumns, column],
        })),
      setColumnWidth: (column, width) =>
        set((state) => ({
          columnWidths: {
            ...state.columnWidths,
            [column]: Math.round(
              Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width))
            ),
          },
        })),
      resetColumnWidth: (column) =>
        set((state) => {
          // Drop the entry rather than writing the default into it, so the
          // column goes back to tracking the registry.
          const next = { ...state.columnWidths };
          delete next[column];
          return { columnWidths: next };
        }),
    }),
    {
      name: "task-list-view-settings",
      storage: ssrSafeJsonStorage,
      // No migration needed for `columnWidths`: persist's default merge is
      // `{...initial, ...persisted}`, so a blob written before this key
      // existed simply leaves the initial `{}` in place.
    }
  )
);
