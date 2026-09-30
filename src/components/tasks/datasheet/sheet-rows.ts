/**
 * The sheet's rows: the hex's bosses first, as a frozen band of milestones in
 * date order, then the tasks in whatever order TaskList sorted them.
 *
 * A boss bound to a Canvas assignment is that assignment — its task moves up
 * into the band and is the boss's row, so the deliverable appears once. An
 * unbound boss (an in-class test) is a read-only milestone row. Pure, so the
 * band's rules are testable.
 */
import { UNASSIGNED_LORD_ID, type Boss } from "@/store/lord";

import type { Task } from "@/types/task";

export type SheetRow =
  | { kind: "task"; task: Task; boss: Boss | null }
  | { kind: "boss"; boss: Boss };

export interface BandFilter {
  activeLordId: string | null;
  search: string | undefined;
  /** The status filter admits completed work, so felled bosses show too. */
  showFelled: boolean;
}

export function buildSheetRows(tasks: Task[], bosses: Boss[], f: BandFilter): SheetRow[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const q = f.search?.trim().toLowerCase() ?? "";

  const band: SheetRow[] = [];
  const pulled = new Set<string>();
  for (const boss of bosses) {
    if (f.activeLordId === UNASSIGNED_LORD_ID) break;
    if (f.activeLordId && boss.lordId !== f.activeLordId) continue;

    const task = boss.boundTaskId ? byId.get(boss.boundTaskId) : undefined;
    if (task) {
      // The task passed the sheet's own filters, so it's shown — as the boss.
      band.push({ kind: "task", task, boss });
      pulled.add(task.id);
      continue;
    }
    // Bound, but its task is filtered out: the boss goes with it.
    if (boss.boundTaskId) continue;
    if (boss.felled && !f.showFelled) continue;
    if (q && !boss.title.toLowerCase().includes(q)) continue;
    band.push({ kind: "boss", boss });
  }

  return [
    ...band,
    ...tasks.filter((t) => !pulled.has(t.id)).map((task): SheetRow => ({ kind: "task", task, boss: null })),
  ];
}

export const rowKey = (row: SheetRow) => (row.kind === "task" ? row.task.id : row.boss.id);

/** Rows before this index are the band. */
export const bandSize = (rows: SheetRow[]) => {
  const i = rows.findIndex((r) => !(r.kind === "boss" || r.boss));
  return i === -1 ? rows.length : i;
};
