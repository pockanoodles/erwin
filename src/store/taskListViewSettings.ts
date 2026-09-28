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
  | "startDate"
  | "materials";

/** Daily-scan columns. Energy/Time/Start date are auto-scheduler inputs and
 *  live behind the Columns picker by default. */
export const DEFAULT_VISIBLE_COLUMNS: TaskColumnId[] = [
  "status",
  "title",
  "priority",
  "dueDate",
  "materials",
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
    | "duration"
    | "materials";
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

  /** The sheet's right-hand pane showing the selected Canvas task's packet. */
  packetOpen: boolean;

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
  setPacketOpen: (open: boolean) => void;
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
      packetOpen: true,

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
      setPacketOpen: (packetOpen) => set({ packetOpen }),
    }),
    {
      name: "task-list-view-settings",
      storage: ssrSafeJsonStorage,
      // No migration needed for `columnWidths` or `packetOpen`: persist's
      // default merge is `{...initial, ...persisted}`, so a blob written
      // before a key existed simply leaves its initial value in place.
      // `visibleColumns` is different — a saved list replaces the default
      // wholesale, so a new default column has to be added to it explicitly.
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<TaskListViewSettings>;
        if (version < 1 && state.visibleColumns && !state.visibleColumns.includes("materials")) {
          const at = state.visibleColumns.indexOf("dueDate");
          const next = [...state.visibleColumns];
          next.splice(at === -1 ? next.length : at + 1, 0, "materials");
          state.visibleColumns = next;
        }
        return state as TaskListViewSettings;
      },
    }
  )
);
