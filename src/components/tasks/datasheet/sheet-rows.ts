/**
 * The sheet's rows: the band the modules pin first (Ladder: the hex's
 * bosses, in date order), then the tasks in whatever order TaskList sorted
 * them. A task a module pulls into the band appears there once, as the
 * module marks it, and not again below. Pure, so the band's rules are
 * testable.
 */
import type { Task } from "@/types/task";

import type { BandItem, BandRow, RowMark } from "../lens";

export type SheetRow =
  | { kind: "task"; task: Task; mark: RowMark | null }
  | { kind: "item"; item: BandItem };

export function buildSheetRows(tasks: Task[], band: BandRow[]): SheetRow[] {
  const pulled = new Set(
    band.flatMap((r) => (r.kind === "task" ? [r.task.id] : []))
  );
  return [
    ...band.map(
      (r): SheetRow =>
        r.kind === "task" ? { kind: "task", task: r.task, mark: r.mark } : r
    ),
    ...tasks
      .filter((t) => !pulled.has(t.id))
      .map((task): SheetRow => ({ kind: "task", task, mark: null })),
  ];
}

export const rowKey = (row: SheetRow) =>
  row.kind === "task" ? row.task.id : row.item.key;

/** The mark the gutter shows for a row, if a module pinned it. */
export const markOf = (row: SheetRow | null): RowMark | null =>
  !row ? null : row.kind === "task" ? row.mark : row.item.mark;

/** Rows before this index are the band. */
export const bandSize = (rows: SheetRow[]) => {
  const i = rows.findIndex((r) => r.kind === "task" && !r.mark);
  return i === -1 ? rows.length : i;
};
