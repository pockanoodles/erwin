"use client";

import { useMemo } from "react";

import {
  HiOutlineDocumentText,
  HiOutlineViewBoards,
  HiSearch,
} from "react-icons/hi";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

import { useIsMobile } from "@/hooks/use-media-query";

import { useTaskListViewSettings } from "@/store/taskListViewSettings";
import { useTaskPageSettings } from "@/store/taskPageSettings";

import { TaskListModeSwitch } from "./TaskListModeSwitch";
import { TASK_COLUMNS } from "./datasheet/columns";
import { TaskFilterMenu } from "./filters/TaskFilterMenu";
import type { VisibleTasks } from "./filters/use-visible-tasks";
import { withLensColumns } from "./lens";
import { useTasksLenses } from "./use-tasks-lenses";

/** A strip control: one height and one voice for everything on the line. */
const CONTROL =
  "flex h-7 flex-none items-center gap-1.5 border border-border px-2 font-mono text-xs uppercase tracking-wide transition-colors duration-150";

/** A control's word. Below xl the strip is too narrow for the mode
 *  segments, Filter, the count, a usable search box and both these words
 *  (measured with the rail open: the search box ran over the count at
 *  768–870px and 1024–1090px), so Columns and Packet keep only their icons
 *  there and name themselves on hover. */
const WORD = "hidden xl:inline";

/** Unavailable here, not gone: it keeps its place and reads as such. */
const UNAVAILABLE =
  "aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:text-muted-foreground";

/**
 * The strip above the list and the board. Kept on the page rather than
 * promoted into the app top bar: the bar holds what's true everywhere, and a
 * filter is a property of this page.
 *
 * It's one line with the same controls in the same places in Rows, Sheet and
 * Board. A control that doesn't apply to the view you're on stays where it
 * is and reads as unavailable, so switching views never moves anything.
 * When it's narrow the search box gives up width and Columns and Packet drop
 * their words; nothing wraps. What keeps it to one line is the Filter
 * button: every filter lives in its menu.
 */
export function TaskListToolbar({
  view,
  surface,
}: {
  view: VisibleTasks;
  surface: "list" | "board";
}) {
  const isMobile = useIsMobile();
  const search = useTaskListViewSettings((s) => s.search);
  const setSearch = useTaskListViewSettings((s) => s.setSearch);
  const visibleColumns = useTaskListViewSettings((s) => s.visibleColumns);
  const toggleColumn = useTaskListViewSettings((s) => s.toggleColumn);
  const packetOpen = useTaskListViewSettings((s) => s.packetOpen);
  const setPacketOpen = useTaskListViewSettings((s) => s.setPacketOpen);
  const { listStyle, setListStyle } = useTaskPageSettings();
  const lenses = useTasksLenses();
  const columns = useMemo(
    () => withLensColumns(TASK_COLUMNS, lenses),
    [lenses]
  );

  const onList = surface === "list";
  const onSheet = onList && listStyle === "sheet";
  const count = view.visible.length;

  return (
    <div className="flex h-11 flex-none items-center gap-2 border-b border-border px-2">
      <TaskListModeSwitch />
      <TaskFilterMenu view={view} />
      <span className="flex-none px-1 font-mono text-xs tabular-nums text-muted-foreground">
        {count} task{count === 1 ? "" : "s"}
      </span>

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
        <div className="relative min-w-24 flex-1 md:max-w-56">
          <HiSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search || ""}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="h-7 w-full pl-8"
          />
        </div>

        {/* A phone always shows rows, so these four are desk controls. */}
        {!isMobile && (
          <>
            <div
              role="group"
              aria-label="List style"
              className="flex h-7 flex-none border border-border"
            >
              {(["rows", "sheet"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => onList && setListStyle(style)}
                  aria-pressed={onList && listStyle === style}
                  aria-disabled={!onList || undefined}
                  title={
                    onList ? undefined : "Rows and Sheet are views of the list"
                  }
                  className={cn(
                    "px-2 font-mono text-xs uppercase tracking-wide transition-colors duration-150",
                    onList && listStyle === style
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                    UNAVAILABLE
                  )}
                >
                  {style}
                </button>
              ))}
            </div>

            {onSheet ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Columns"
                    title="Columns"
                    className={cn(
                      CONTROL,
                      "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <HiOutlineViewBoards className="h-3.5 w-3.5" />
                    <span className={WORD}>Columns</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {columns.map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={
                        col.id === "title" || visibleColumns.includes(col.id)
                      }
                      disabled={col.id === "title"}
                      onCheckedChange={() => toggleColumn(col.id)}
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                type="button"
                aria-disabled
                aria-label="Columns"
                title="Columns belong to the sheet"
                className={cn(CONTROL, "text-muted-foreground", UNAVAILABLE)}
              >
                <HiOutlineViewBoards className="h-3.5 w-3.5" />
                <span className={WORD}>Columns</span>
              </button>
            )}

            <button
              type="button"
              aria-pressed={onSheet && packetOpen}
              aria-disabled={!onSheet || undefined}
              onClick={() => onSheet && setPacketOpen(!packetOpen)}
              aria-label="Packet"
              title={
                onSheet
                  ? "Show the selected Canvas task's instructions, rubric and materials"
                  : "The packet opens beside the sheet"
              }
              className={cn(
                CONTROL,
                onSheet && packetOpen
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
                UNAVAILABLE
              )}
            >
              <HiOutlineDocumentText className="h-3.5 w-3.5" />
              <span className={WORD}>Packet</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
