"use client";

import type { ReactNode } from "react";

import { HiClock, HiExclamation } from "react-icons/hi";

import {
  createUTCMidnightDate,
  format,
  newDate,
  newDateFromYMD,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import type { TaskColumnId } from "@/store/taskListViewSettings";

import {
  EnergyLevel,
  Priority,
  Task,
  TaskStatus,
  TimePreference,
} from "@/types/task";

import {
  energyLevelColors,
  formatContextualDate,
  formatEnumValue,
  priorityColors,
  statusColors,
  timePreferenceColors,
} from "../utils/task-list-utils";

/**
 * One description per column, and everything about that column lives in it.
 *
 * The value bar above the sheet is why this exists. It has to show any cell's
 * full contents and write any cell back, which means something has to know —
 * generically, for a column it was not written against — how a cell looks, how
 * it reads as plain text, and how to turn an edit into a task patch. That used
 * to be a `field === "dueDate" ? … : field === "lord" ? …` ladder repeated in
 * the cell renderer and again in the editor, and adding a column meant finding
 * every ladder. Here a column is one object and the grid stays generic.
 *
 * These are the core's columns. A module adds its own through its Tasks lens
 * (components/tasks/lens.ts): Courses the Mat column, Ladder the Lord column.
 */

/** The core's sort keys; a module's column brings its own. */
export type SortKey =
  | "title"
  | "status"
  | "dueDate"
  | "startDate"
  | "priority"
  | "energyLevel"
  | "preferredTime"
  | "duration"
  | "schedule"
  | (string & {});

/** A patch as `onInlineEdit` wants it: a whole task plus the API's goal setter. */
export type TaskPatch = Task & { goalId?: string | null };

export type ColumnEditor =
  | { kind: "text" }
  | { kind: "number"; unit: string }
  | { kind: "date" }
  | { kind: "enum"; options: () => EnumOption[] }
  /** Derived from other fields — shown in the bar, not editable there. */
  | { kind: "readonly" };

export interface EnumOption {
  value: string;
  label: string;
}

export interface TaskColumn {
  id: TaskColumnId;
  label: string;
  sortKey: SortKey;
  /** Fixed px width, Excel-style. Columns don't reflow; the sheet scrolls. */
  width: number;
  align?: "left" | "right";
  /** What the cell shows. Truncated by the grid — never wraps. */
  render: (task: Task) => ReactNode;
  /** The full value as plain text. This is what the value bar displays. */
  text: (task: Task) => string;
  editor: ColumnEditor;
  /** The current value in the shape the editor's form control wants. */
  formValue: (task: Task) => string;
  /** Turn a committed form value into a patch. `null` = reject, keep editing. */
  commit?: (raw: string, task: Task) => TaskPatch | null;
  /** A module's column: the core column it follows in the sheet. */
  after?: TaskColumnId;
  /** A module's column: what it sorts by. Empty values sort last either way. */
  sortValue?: (task: Task) => string | number | null;
}

/** An empty cell. */
export const EMPTY = <span className="text-muted-foreground/40">—</span>;

/** `<input type="date">` speaks yyyy-MM-dd, and task dates are UTC midnight. */
function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fromDateInput(raw: string): Date | null {
  if (!raw) return null;
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return null;
  // Same UTC-midnight convention the rest of the app stores dates in.
  return createUTCMidnightDate(new Date(y, m - 1, d));
}

/** The short label a cell shows: "Tomorrow", "Mar 10", "Overdue: Aug 31". */
export function dateLabel(value: Date | string | null | undefined): string {
  if (!value) return "";
  return formatContextualDate(newDate(value)).text;
}

/**
 * The unabbreviated value, for the bar and the cell tooltip. Cells say
 * "Tomorrow" because that's what's useful while scanning; this is where you
 * find out that tomorrow means Sep 15 at 11:59 PM.
 */
export function dateText(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = newDate(value);
  const local = newDateFromYMD(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate()
  );
  const midnightUTC =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  // A UTC-midnight date carries no time — printing one would show the
  // timezone offset as if the user had chosen it.
  return midnightUTC
    ? format(local, "EEEE, MMMM d, yyyy")
    : `${format(local, "EEEE, MMMM d, yyyy")} · ${format(d, "p")}`;
}

/** A coloured enum chip, the one place the sheet is allowed any fill. */
function chip(value: string | null | undefined, colors: Record<string, string>) {
  if (!value) return EMPTY;
  return (
    <span className={cn("px-1.5 py-px text-[11px]", colors[value])}>
      {formatEnumValue(value)}
    </span>
  );
}

function enumOptions(values: string[], emptyLabel: string): EnumOption[] {
  return [
    { value: "", label: emptyLabel },
    ...values.map((v) => ({ value: v, label: formatEnumValue(v) })),
  ];
}

function scheduleText(task: Task): string {
  if (!task.isAutoScheduled) return "Manual";
  if (task.scheduledStart && task.scheduledEnd) {
    return `${format(newDate(task.scheduledStart), "MMM d, p")}–${format(
      newDate(task.scheduledEnd),
      "p"
    )}`;
  }
  return "Auto";
}

/** Render order. Title is pinned visible by the column picker. A module's
 *  columns slot in after theirs (`after`). */
export const TASK_COLUMNS: readonly TaskColumn[] = [
  {
    id: "status",
    label: "Status",
    sortKey: "status",
    width: 108,
    render: (t) => chip(t.status, statusColors),
    text: (t) => formatEnumValue(t.status),
    editor: {
      kind: "enum",
      options: () =>
        Object.values(TaskStatus).map((v) => ({
          value: v,
          label: formatEnumValue(v),
        })),
    },
    formValue: (t) => t.status,
    commit: (raw, t) => ({ ...t, status: raw as TaskStatus }),
  },
  {
    id: "title",
    label: "Title",
    sortKey: "title",
    width: 380,
    render: (t) => (
      <span className="task-title text-foreground">{t.title}</span>
    ),
    text: (t) => t.title,
    editor: { kind: "text" },
    formValue: (t) => t.title,
    commit: (raw, t) => (raw.trim() ? { ...t, title: raw } : null),
  },
  {
    id: "priority",
    label: "Priority",
    sortKey: "priority",
    width: 96,
    render: (t) => chip(t.priority, priorityColors),
    text: (t) => (t.priority ? formatEnumValue(t.priority) : ""),
    editor: {
      kind: "enum",
      options: () => enumOptions(Object.values(Priority), "No priority"),
    },
    formValue: (t) => t.priority ?? "",
    commit: (raw, t) => ({ ...t, priority: (raw || null) as Priority | null }),
  },
  {
    id: "energyLevel",
    label: "Energy",
    sortKey: "energyLevel",
    width: 96,
    render: (t) => chip(t.energyLevel, energyLevelColors),
    text: (t) => (t.energyLevel ? formatEnumValue(t.energyLevel) : ""),
    editor: {
      kind: "enum",
      options: () => enumOptions(Object.values(EnergyLevel), "No energy level"),
    },
    formValue: (t) => t.energyLevel ?? "",
    commit: (raw, t) => ({
      ...t,
      energyLevel: (raw || null) as EnergyLevel | null,
    }),
  },
  {
    id: "preferredTime",
    label: "Time",
    sortKey: "preferredTime",
    width: 96,
    render: (t) => chip(t.preferredTime, timePreferenceColors),
    text: (t) => (t.preferredTime ? formatEnumValue(t.preferredTime) : ""),
    editor: {
      kind: "enum",
      options: () =>
        enumOptions(Object.values(TimePreference), "No time preference"),
    },
    formValue: (t) => t.preferredTime ?? "",
    commit: (raw, t) => ({
      ...t,
      preferredTime: (raw || null) as TimePreference | null,
    }),
  },
  {
    id: "dueDate",
    label: "Due date",
    sortKey: "dueDate",
    width: 132,
    render: (t) => {
      if (!t.dueDate) return EMPTY;
      const { text, isOverdue } = formatContextualDate(newDate(t.dueDate));
      return (
        <span
          className={cn(
            "flex items-center gap-1",
            isOverdue ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {/* The shared formatter prefixes "Overdue: " because the board has
              no column header to lean on. Here the header says Due date, the
              text is red and there's a warning glyph — a fourth statement of
              the same fact costs eight characters the date needs. */}
          <span className="truncate">
            {isOverdue ? text.replace(/^Overdue: /, "") : text}
          </span>
          {isOverdue && (
            <HiExclamation
              className="h-3 w-3 flex-none"
              title={`Overdue — ${dateText(t.dueDate)}`}
            />
          )}
        </span>
      );
    },
    text: (t) => dateText(t.dueDate),
    editor: { kind: "date" },
    formValue: (t) => toDateInput(t.dueDate),
    commit: (raw, t) => ({ ...t, dueDate: fromDateInput(raw) }),
  },
  {
    id: "duration",
    label: "Duration",
    sortKey: "duration",
    width: 88,
    align: "right",
    render: (t) =>
      t.duration ? (
        <span className="tabular-nums text-muted-foreground">
          {t.duration}m
        </span>
      ) : (
        EMPTY
      ),
    text: (t) => (t.duration ? `${t.duration} minutes` : ""),
    editor: { kind: "number", unit: "minutes" },
    formValue: (t) => (t.duration ? String(t.duration) : ""),
    commit: (raw, t) => {
      if (!raw.trim()) return { ...t, duration: null };
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? { ...t, duration: n } : null;
    },
  },
  {
    id: "schedule",
    label: "Schedule",
    sortKey: "schedule",
    width: 168,
    render: (t) =>
      t.isAutoScheduled ? (
        <span
          className="flex items-center gap-1.5 text-muted-foreground"
          title={
            t.scheduleScore
              ? `Auto-scheduled · score ${Math.round(t.scheduleScore * 100)}%`
              : "Auto-scheduled"
          }
        >
          <HiClock className="h-3 w-3 flex-none text-rust-text" />
          <span className="truncate">{scheduleText(t)}</span>
        </span>
      ) : (
        <span className="text-muted-foreground/50">Manual</span>
      ),
    text: scheduleText,
    editor: { kind: "readonly" },
    formValue: scheduleText,
  },
  {
    id: "startDate",
    label: "Start date",
    sortKey: "startDate",
    width: 124,
    render: (t) =>
      t.startDate ? (
        <span className="text-muted-foreground">{dateLabel(t.startDate)}</span>
      ) : (
        EMPTY
      ),
    text: (t) => dateText(t.startDate),
    editor: { kind: "date" },
    formValue: (t) => toDateInput(t.startDate),
    commit: (raw, t) => ({ ...t, startDate: fromDateInput(raw) }),
  },
];
