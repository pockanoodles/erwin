import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ssrSafeJsonStorage } from "@/lib/storage/ssr-safe-json-storage";

import { EnergyLevel, TaskListMode, TaskStatus, TimePreference } from "@/types/task";

/** The core's columns; a module's column brings its own id (Courses:
 *  "materials", Ladder: "goal"). Ids are what's persisted. */
export type TaskColumnId =
  | "status"
  | "title"
  | "priority"
  | "energyLevel"
  | "preferredTime"
  | "dueDate"
  | "duration"
  | "schedule"
  | "startDate"
  | (string & {});

/** Daily-scan columns, modules' included. Energy/Time/Start date are
 *  auto-scheduler inputs and live behind the Columns picker by default. */
export const DEFAULT_VISIBLE_COLUMNS: TaskColumnId[] = [
  "status",
  "title",
  "priority",
  "dueDate",
  "materials",
  "duration",
  "goal",
  "schedule",
];

interface TaskListViewSettings {
  // Sort settings: a core key, or a module column's own.
  sortBy:
    | "dueDate"
    | "startDate"
    | "title"
    | "status"
    | "schedule"
    | "priority"
    | "energyLevel"
    | "preferredTime"
    | "duration"
    | (string & {});
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
      version: 3,
      migrate: (persisted, version) => {
        const state = persisted as Partial<TaskListViewSettings>;
        if (version < 1 && state.visibleColumns && !state.visibleColumns.includes("materials")) {
          const at = state.visibleColumns.indexOf("dueDate");
          const next = [...state.visibleColumns];
          next.splice(at === -1 ? next.length : at + 1, 0, "materials");
          state.visibleColumns = next;
        }
        // "project" was the Lord column's sort key before it was the Lord's.
        if (version < 2 && state.sortBy === "project") state.sortBy = "lord";
        // The Lord column became the Goal column.
        if (version < 3) {
          if (state.sortBy === "lord") state.sortBy = "goal";
          state.visibleColumns = state.visibleColumns?.map((c) =>
            c === "lord" ? "goal" : c
          );
          if (state.columnWidths && "lord" in state.columnWidths) {
            const { lord, ...rest } = state.columnWidths;
            state.columnWidths = { ...rest, goal: lord };
          }
        }
        return state as TaskListViewSettings;
      },
    }
  )
);
