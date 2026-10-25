"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HiChevronDown, HiChevronUp, HiPencil, HiTrash } from "react-icons/hi";

import { cn } from "@/lib/utils";

import { useTaskModule } from "@/modules/client";

import { useLordStore, type Boss } from "@/store/lord";
import { useMaterialCountsStore } from "@/store/materialCounts";
import { useOnModules } from "@/store/modules";
import {
  useTaskListViewSettings,
  type TaskColumnId,
} from "@/store/taskListViewSettings";

import { Task, TaskStatus } from "@/types/task";

import { useDraggableTask } from "../../dnd/useDragAndDrop";
import { isUpcomingTask } from "../utils/task-list-utils";
import { bossCell, bossCellText } from "./boss-cells";
import { BossPane, BossStrip } from "./BossPane";
import {
  TASK_COLUMNS,
  columnsFor,
  type ColumnContext,
  type SortKey,
  type TaskPatch,
} from "./columns";
import { bandSize, rowKey, type SheetRow } from "./sheet-rows";
import { useColumnResize } from "./useColumnResize";
import { ValueBar } from "./ValueBar";

/**
 * The task list as a datasheet.
 *
 * The old table was a Notion-shaped thing: 44px rows, no vertical rules, cells
 * that opened editors inline and grew, values silently truncated with no way
 * to see the rest. This is the spreadsheet reading of the same data — a fixed
 * row height so your eye can scan a column, ruled cells so a value belongs
 * visibly to a column, a numbered gutter so you can refer to a row, and one
 * cell selected at a time with its full contents in the bar above.
 *
 * Density is deliberate and desktop-only: 26px rows are below the 44px touch
 * target floor, which is the correct trade for a sheet you drive with a
 * pointer and arrow keys. Every other surface in the app keeps the floor.
 *
 * The hex's bosses sit above the tasks as a frozen band (see sheet-rows): a
 * milestone row per boss, or the assignment's own row when the boss is one.
 * The gutter marks them ⚔ instead of a number, and a full-strength rule under
 * the band is Excel's freeze-pane line.
 */

/** Uniform row height. The one property that makes a sheet scannable. */
const ROW = "h-[26px]";

/** Fakes ROW-height hairlines on the filler table below the last record. */
const ROW_GRID_STYLE = {
  backgroundImage:
    "linear-gradient(to bottom, transparent 25px, hsl(var(--border) / 0.6) 25px, hsl(var(--border) / 0.6) 26px)",
  backgroundSize: "100% 26px",
};

const GUTTER_WIDTH = 44;
const DONE_WIDTH = 32;
const ACTIONS_WIDTH = 60;

interface TaskSheetProps {
  /** Already filtered and sorted by TaskList: the boss band, then tasks. */
  rows: SheetRow[];
  visibleColumns: Set<TaskColumnId>;
  sortBy: SortKey;
  sortDirection: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onInlineEdit: (task: TaskPatch) => void;
  /** Show the selected task's Canvas packet in a pane beside the grid. */
  packetOpen: boolean;
}

/** Wide enough for a rubric table and a material title; the grid keeps the rest. */
const PACKET_WIDTH = 380;

interface CellRef {
  row: number;
  col: number;
}

export function TaskSheet({
  rows,
  visibleColumns,
  sortBy,
  sortDirection,
  onSort,
  onEdit,
  onDelete,
  onStatusChange,
  onInlineEdit,
  packetOpen,
}: TaskSheetProps) {
  const lords = useLordStore((s) => s.lords);
  const materialCounts = useMaterialCountsStore((s) => s.counts);
  const ctx = useMemo(() => ({ lords, materialCounts }), [lords, materialCounts]);

  const columnWidths = useTaskListViewSettings((s) => s.columnWidths);
  const setColumnWidth = useTaskListViewSettings((s) => s.setColumnWidth);
  const resetColumnWidth = useTaskListViewSettings((s) => s.resetColumnWidth);
  const resize = useColumnResize(setColumnWidth);

  const onModules = useOnModules();
  const columns = useMemo(
    () =>
      columnsFor(new Set(onModules.map((m) => m.id))).filter((c) =>
        visibleColumns.has(c.id)
      ),
    [visibleColumns, onModules]
  );

  /** Registry default, unless the header edge has been dragged. */
  const widthOf = (id: TaskColumnId, fallback: number) =>
    resize.active?.column === id
      ? resize.active.width
      : (columnWidths[id] ?? fallback);

  // Widths are absolute once they're draggable — proportional columns would
  // quietly steal the pixels back from a neighbour as you widened one, which
  // is not what pulling an edge means. Below the container the table still
  // stretches to fill it and the trailing filler column takes the slack, so
  // there's no dead space and no scrollbar until you've earned one.
  const tableWidth =
    GUTTER_WIDTH +
    DONE_WIDTH +
    ACTIONS_WIDTH +
    columns.reduce((sum, c) => sum + widthOf(c.id, c.width), 0);

  // Shared by the data table and the filler table below it, so a resized
  // column can't drift the two grids out of alignment.
  const colgroup = (
    <colgroup>
      <col style={{ width: GUTTER_WIDTH }} />
      <col style={{ width: DONE_WIDTH }} />
      {columns.map((c) => (
        <col key={c.id} style={{ width: widthOf(c.id, c.width) }} />
      ))}
      <col style={{ width: ACTIONS_WIDTH }} />
      {/* Excel's empty columns: the grid keeps going past the data. */}
      <col />
    </colgroup>
  );

  const [active, setActive] = useState<CellRef>({ row: 0, col: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filtering or sorting can pull the selected cell out from under the
  // selection; clamp rather than clear, so the cursor stays roughly put.
  const row = Math.min(active.row, Math.max(0, rows.length - 1));
  const col = Math.min(active.col, Math.max(0, columns.length - 1));
  const activeRow: SheetRow | null = rows[row] ?? null;
  const activeTask: Task | null = activeRow?.kind === "task" ? activeRow.task : null;
  const activeBoss: Boss | null = activeRow ? (activeRow.kind === "boss" ? activeRow.boss : activeRow.boss) : null;
  const activeColumn = columns[col] ?? null;

  // Band rows are marked ⚔; tasks are numbered from 1 below them.
  const band = bandSize(rows);
  const rowNumberOf = (r: number) => (r < band ? null : r - band + 1);

  const move = useCallback(
    (dRow: number, dCol: number) => {
      setActive(() => {
        let r = row + dRow;
        let c = col + dCol;
        // Horizontal overflow wraps to the next/previous row, like Tab does in
        // a spreadsheet — otherwise Tab dead-ends at the last column.
        if (c < 0) {
          c = columns.length - 1;
          r -= 1;
        } else if (c > columns.length - 1) {
          c = 0;
          r += 1;
        }
        return {
          row: Math.max(0, Math.min(rows.length - 1, r)),
          col: Math.max(0, Math.min(columns.length - 1, c)),
        };
      });
    },
    [row, col, columns.length, rows.length]
  );

  // Keep the selection on screen when it's driven from the keyboard.
  useEffect(() => {
    scrollRef.current
      ?.querySelector("[data-active-cell]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [row, col]);

  const focusValueBar = () => {
    const field = document.querySelector<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("[data-value-bar-input]");
    field?.focus();
    // Only the text-ish fields have text to preselect; a <select> has no
    // `select()` at all, so calling it unconditionally would throw.
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement
    ) {
      field.select();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        move(-1, 0);
        break;
      case "ArrowDown":
        e.preventDefault();
        move(1, 0);
        break;
      case "ArrowLeft":
        e.preventDefault();
        move(0, -1);
        break;
      case "ArrowRight":
        e.preventDefault();
        move(0, 1);
        break;
      case "Tab":
        e.preventDefault();
        move(0, e.shiftKey ? -1 : 1);
        break;
      case "Home":
        e.preventDefault();
        setActive({ row: e.metaKey || e.ctrlKey ? 0 : row, col: 0 });
        break;
      case "End":
        e.preventDefault();
        setActive({
          row: e.metaKey || e.ctrlKey ? rows.length - 1 : row,
          col: columns.length - 1,
        });
        break;
      case "Enter":
      case "F2":
        e.preventDefault();
        focusValueBar();
        break;
      default:
        break;
    }
  };

  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ValueBar
          task={null}
          rowNumber={null}
          column={null}
          ctx={ctx}
          onCommit={onInlineEdit}
        />
        <p className="p-8 text-center text-sm text-muted-foreground">
          No tasks found. Try adjusting your filters or create a new task.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ValueBar
        task={activeTask}
        rowNumber={activeRow ? rowNumberOf(row) : null}
        rowLabel={activeBoss ? "⚔" : undefined}
        readonlyText={
          activeRow?.kind === "boss" && activeColumn
            ? bossCellText(activeRow.boss, activeColumn.id, ctx)
            : undefined
        }
        column={activeColumn}
        ctx={ctx}
        onCommit={onInlineEdit}
        onCommitted={() => {
          // Excel advances a row on commit, which is what makes a column of
          // edits fast. Put focus back on the grid so arrows work again.
          move(1, 0);
          scrollRef.current?.focus();
        }}
      />

      <div className="flex min-h-0 flex-1">
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Task sheet"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto outline-none"
      >
        {/* border-separate, not collapse: a sticky header with collapsed
            borders drops its bottom rule in WebKit as soon as it detaches. */}
        <table
          style={{ width: tableWidth }}
          // `select-none` on the whole grid, permanently. Dragging across a
          // spreadsheet selects cells, not the text inside them, and here it
          // would fight three separate drags — resize, row-to-calendar, and
          // cell selection — each of which otherwise leaves a blue smear
          // across the sheet behind it. The value bar is outside the table and
          // stays selectable, which is where you copy a value from anyway.
          className="min-w-full table-fixed select-none border-separate border-spacing-0 text-[13px]"
        >
          {colgroup}

          <thead>
            <tr>
              <th
                scope="col"
                className={cn(
                  ROW,
                  "sticky left-0 top-0 z-30 border-b border-r border-border bg-muted px-2",
                  "font-mono text-[10px] font-normal uppercase tracking-wide text-muted-foreground"
                )}
              >
                #
              </th>
              <th
                scope="col"
                className={cn(
                  ROW,
                  "sticky top-0 z-20 border-b border-r border-border bg-muted"
                )}
              >
                <span className="sr-only">Completed</span>
              </th>
              {columns.map((c, i) => {
                const isSorted = sortBy === c.sortKey;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={
                      isSorted
                        ? sortDirection === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={cn(
                      ROW,
                      "sticky top-0 z-20 border-b border-r border-border p-0 text-left",
                      // The active cell's column header lights up, so a
                      // selection deep in the sheet still says what it is.
                      i === col ? "bg-rust/20" : "bg-muted"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSort(c.sortKey)}
                      className={cn(
                        "flex h-full w-full items-center gap-1 px-2",
                        "font-mono text-[10px] uppercase tracking-wide transition-colors duration-150",
                        // Headers sit over their data, so a numeric column's
                        // header goes right with it.
                        c.align === "right" && "justify-end",
                        isSorted
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="truncate">{c.label}</span>
                      {isSorted ? (
                        sortDirection === "asc" ? (
                          <HiChevronUp className="h-3 w-3 flex-none" />
                        ) : (
                          <HiChevronDown className="h-3 w-3 flex-none" />
                        )
                      ) : null}
                    </button>

                    {/* Drag the edge to resize; double-click to snap back to
                        the default. Sits over the right end of the sort
                        button, so it stops the pointer event reaching it. */}
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${c.label} column`}
                      tabIndex={0}
                      onDoubleClick={() => resetColumnWidth(c.id)}
                      {...resize.handleProps(c.id, widthOf(c.id, c.width))}
                      className={cn(
                        "absolute inset-y-0 right-0 z-10 w-1.5 translate-x-1/2 cursor-col-resize select-none",
                        "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2",
                        "after:transition-colors after:duration-150 after:content-['']",
                        "focus:outline-none focus-visible:after:bg-rust hover:after:bg-rust",
                        resize.active?.column === c.id
                          ? "after:bg-rust"
                          : "after:bg-transparent"
                      )}
                    />
                  </th>
                );
              })}
              <th
                scope="col"
                className={cn(
                  ROW,
                  "sticky top-0 z-20 border-b border-r border-border bg-muted"
                )}
              >
                <span className="sr-only">Actions</span>
              </th>
              <th
                scope="col"
                className={cn(ROW, "sticky top-0 z-20 border-b border-border bg-muted")}
              />
            </tr>
          </thead>

          <tbody>
            {rows.map((sheetRow, r) =>
              sheetRow.kind === "boss" ? (
                <BossRow
                  key={rowKey(sheetRow)}
                  boss={sheetRow.boss}
                  bandEnd={r === band - 1}
                  isActiveRow={r === row}
                  activeCol={r === row ? col : -1}
                  columns={columns}
                  ctx={ctx}
                  onSelect={(c) => setActive({ row: r, col: c })}
                />
              ) : (
                <TaskSheetRow
                  key={rowKey(sheetRow)}
                  task={sheetRow.task}
                  boss={sheetRow.boss}
                  rowNumber={rowNumberOf(r)}
                  bandEnd={r === band - 1}
                  isActiveRow={r === row}
                  activeCol={r === row ? col : -1}
                  columns={columns}
                  ctx={ctx}
                  onSelect={(c) => setActive({ row: r, col: c })}
                  onOpenValueBar={focusValueBar}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onStatusChange={onStatusChange}
                />
              )
            )}
          </tbody>
        </table>

        {/* Excel keeps drawing the row grid past the last record instead of
            going blank. A second table sharing the data table's colgroup
            grows to fill whatever height is left in the scroller — one row,
            so there's no per-row height to fight over — and a repeating
            gradient fakes hairlines at the same 26px cadence, with each
            column's own border-r continuing the vertical rules too. */}
        <table
          aria-hidden="true"
          className="min-w-full flex-1 table-fixed border-separate border-spacing-0"
        >
          {colgroup}
          <tbody>
            <tr>
              <td
                colSpan={2}
                className="border-r border-border/60 p-0"
                style={ROW_GRID_STYLE}
              />
              {columns.map((c, i) => (
                <td
                  key={c.id}
                  className={cn(
                    "border-border/60 p-0",
                    i < columns.length - 1 && "border-r"
                  )}
                  style={ROW_GRID_STYLE}
                />
              ))}
              <td
                className="border-r border-border/60 p-0"
                style={ROW_GRID_STYLE}
              />
              <td className="p-0" style={ROW_GRID_STYLE} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Excel's task pane: follows the selected row, so arrowing down the
          sheet reads each assignment's packet without opening anything. */}
      {packetOpen ? (
        <aside
          aria-label="Task packet"
          style={{ width: PACKET_WIDTH }}
          className="flex-none overflow-y-auto border-l border-border"
        >
          {activeRow?.kind === "boss" ? (
            <BossPane
              boss={activeRow.boss}
              lordTitle={lords.find((l) => l.id === activeRow.boss.lordId)?.title ?? null}
            />
          ) : (
            <>
              {activeBoss ? <BossStrip boss={activeBoss} /> : null}
              <TaskReadingPane task={activeTask ?? null} />
            </>
          )}
        </aside>
      ) : null}
      </div>
    </div>
  );
}

function TaskSheetRow({
  task,
  boss,
  rowNumber,
  bandEnd,
  isActiveRow,
  activeCol,
  columns,
  ctx,
  onSelect,
  onOpenValueBar,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  task: Task;
  /** Set when this task is a boss (bound to its Canvas assignment). */
  boss: Boss | null;
  /** Null for a band row, which the gutter marks ⚔ instead. */
  rowNumber: number | null;
  bandEnd: boolean;
  isActiveRow: boolean;
  activeCol: number;
  columns: typeof TASK_COLUMNS;
  ctx: ColumnContext;
  onSelect: (col: number) => void;
  onOpenValueBar: () => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}) {
  const { draggableProps, isDragging } = useDraggableTask(task);
  const isCompleted = task.status === TaskStatus.COMPLETED;
  const isUpcoming = isUpcomingTask(task);

  const cellBase = cn(
    ROW,
    "relative max-w-0 truncate border-b border-r px-2 align-middle",
    bandEnd ? "border-b-border border-r-border/60" : "border-border/60"
  );

  return (
    <tr
      className={cn(
        "group",
        boss && "font-medium",
        isDragging && "opacity-50",
        isUpcoming && "text-muted-foreground",
        isCompleted && "text-muted-foreground line-through decoration-1"
      )}
    >
      {/* Row header doubles as the drag grip — the same place you'd grab a row
          in a spreadsheet, and it keeps drag-to-calendar without spending a
          column on a handle nobody can see until they hover it. */}
      <td
        {...draggableProps}
        className={cn(
          ROW,
          "sticky left-0 z-10 cursor-grab select-none border-b border-r border-border px-2 text-right",
          "font-mono text-[10px] tabular-nums",
          // Opaque, not a tint. A frozen column with a translucent background
          // lets the columns scrolling underneath show straight through it —
          // the row numbers end up printed over other rows' text.
          isActiveRow
            ? "bg-accent text-accent-foreground"
            : "bg-muted text-muted-foreground"
        )}
        title={
          boss
            ? `Boss: ${boss.title}. Drag onto the calendar to schedule`
            : "Drag onto the calendar to schedule"
        }
      >
        {rowNumber ?? "⚔"}
      </td>

      <td
        className={cn(
          ROW,
          "border-b border-r border-border/60 text-center align-middle",
          bandEnd && "border-b-border",
          isActiveRow && "bg-rust/5"
        )}
      >
        <input
          type="checkbox"
          checked={isCompleted}
          onChange={() =>
            onStatusChange(
              task.id,
              isCompleted ? TaskStatus.TODO : TaskStatus.COMPLETED
            )
          }
          aria-label={isCompleted ? "Mark as todo" : "Mark as completed"}
          className="h-3.5 w-3.5 cursor-pointer border-border bg-transparent text-foreground focus:ring-0 focus:ring-offset-0"
        />
      </td>

      {columns.map((c, i) => {
        const isActive = i === activeCol;
        return (
          <td
            key={c.id}
            data-active-cell={isActive || undefined}
            onClick={() => onSelect(i)}
            onDoubleClick={() => {
              onSelect(i);
              onOpenValueBar();
            }}
            title={c.text(task, ctx) || undefined}
            className={cn(
              cellBase,
              c.align === "right" && "text-right",
              isActive
                ? "z-20 outline outline-2 -outline-offset-2 outline-rust"
                : "cursor-cell",
              isActiveRow && !isActive && "bg-rust/5",
              !isActiveRow && "group-hover:bg-muted/40"
            )}
          >
            {c.render(task, ctx)}
          </td>
        );
      })}

      <td
        className={cn(
          ROW,
          "border-b border-r border-border/60 px-1",
          bandEnd && "border-b-border",
          isActiveRow && "bg-rust/5"
        )}
      >
        <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(task)}
            title="Open task"
            aria-label="Open task"
            className="flex h-5 w-5 items-center justify-center text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <HiPencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            title="Delete task"
            aria-label="Delete task"
            className="flex h-5 w-5 items-center justify-center text-muted-foreground transition-colors duration-150 hover:text-destructive"
          >
            <HiTrash className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>

      <td
        className={cn(
          ROW,
          "border-b border-border/60",
          bandEnd && "border-b-border",
          isActiveRow ? "bg-rust/5" : "group-hover:bg-muted/40"
        )}
      />
    </tr>
  );
}

/**
 * An unbound boss: a milestone, not a task. Same grid and selection as a task
 * row so arrowing through the band just works, but nothing to tick, drag or
 * delete — it's written in the vault, and killed there.
 */
function BossRow({
  boss,
  bandEnd,
  isActiveRow,
  activeCol,
  columns,
  ctx,
  onSelect,
}: {
  boss: Boss;
  bandEnd: boolean;
  isActiveRow: boolean;
  activeCol: number;
  columns: typeof TASK_COLUMNS;
  ctx: ColumnContext;
  onSelect: (col: number) => void;
}) {
  const rule = bandEnd ? "border-b-border" : "border-b-border/60";
  return (
    <tr className={cn("group", boss.felled && "text-muted-foreground line-through decoration-1")}>
      <td
        className={cn(
          ROW,
          "sticky left-0 z-10 border-b border-r border-border px-2 text-right font-mono text-[11px]",
          isActiveRow ? "bg-accent text-accent-foreground" : "bg-muted text-foreground"
        )}
        title={`Boss: ${boss.title}`}
      >
        ⚔
      </td>
      <td className={cn(ROW, "border-b border-r border-r-border/60", rule, isActiveRow && "bg-rust/5")} />
      {columns.map((c, i) => {
        const isActive = i === activeCol;
        return (
          <td
            key={c.id}
            data-active-cell={isActive || undefined}
            onClick={() => onSelect(i)}
            title={bossCellText(boss, c.id, ctx) || undefined}
            className={cn(
              ROW,
              "relative max-w-0 truncate border-b border-r border-r-border/60 px-2 align-middle",
              rule,
              c.align === "right" && "text-right",
              isActive
                ? "z-20 outline outline-2 -outline-offset-2 outline-rust"
                : "cursor-cell",
              isActiveRow && !isActive && "bg-rust/5",
              !isActiveRow && "group-hover:bg-muted/40"
            )}
          >
            {bossCell(boss, c.id, ctx)}
          </td>
        );
      })}
      <td className={cn(ROW, "border-b border-r border-r-border/60", rule, isActiveRow && "bg-rust/5")} />
      <td className={cn(ROW, "border-b", rule, isActiveRow ? "bg-rust/5" : "group-hover:bg-muted/40")} />
    </tr>
  );
}

/** The pane beside the sheet: the selected task as its module reads it
 *  (Courses: the Canvas packet), or a note when there's nothing more. */
function TaskReadingPane({ task }: { task: Task | null }) {
  const owner = useTaskModule(task?.source);
  if (!task) {
    return <p className="p-4 text-[13px] text-muted-foreground">Select a task.</p>;
  }
  const Pane = owner?.TaskPane;
  return Pane ? (
    <Pane taskId={task.id} />
  ) : (
    <p className="p-4 text-[13px] text-muted-foreground">
      Nothing more to read for this task.
    </p>
  );
}
