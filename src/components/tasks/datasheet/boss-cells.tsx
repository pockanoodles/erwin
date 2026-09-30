"use client";

import type { ReactNode } from "react";

import { differenceInCalendarDays, format, newDate } from "@/lib/date-utils";

import type { Boss } from "@/store/lord";
import type { TaskColumnId } from "@/store/taskListViewSettings";

import { dateLabel, type ColumnContext } from "./columns";

/**
 * How an unbound boss fills the sheet's columns. It isn't a task — nothing to
 * schedule, estimate or prioritise — so it answers only the columns a
 * milestone has: what, when, whose, and whether it's down.
 */

const lordTitle = (boss: Boss, ctx: ColumnContext) =>
  ctx.lords.find((l) => l.id === boss.lordId)?.title ?? "";

/** "in 8 days" / "today" / "3 days ago": a boss is read as a countdown. */
export function countdown(targetDate: string | null): string {
  if (!targetDate) return "";
  const days = differenceInCalendarDays(newDate(targetDate), newDate());
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export function bossCellText(boss: Boss, column: TaskColumnId, ctx: ColumnContext): string {
  switch (column) {
    case "title":
      return boss.title;
    case "status":
      return boss.felled ? "Felled" : "Boss";
    case "dueDate":
      return boss.targetDate
        ? `${format(newDate(boss.targetDate), "EEE MMM d")} · ${countdown(boss.targetDate)}`
        : "No date";
    case "lord":
      return lordTitle(boss, ctx);
    default:
      return "";
  }
}

export function bossCell(boss: Boss, column: TaskColumnId, ctx: ColumnContext): ReactNode {
  switch (column) {
    case "title":
      return <span className="font-medium text-foreground">{boss.title}</span>;
    case "status":
      return (
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {boss.felled ? "Felled" : "Boss"}
        </span>
      );
    case "dueDate":
      return boss.targetDate ? (
        <span className="tabular-nums text-foreground">{dateLabel(boss.targetDate)}</span>
      ) : null;
    case "lord":
      return <span className="text-foreground">{lordTitle(boss, ctx)}</span>;
    default:
      return null;
  }
}
