/**
 * Which of the hex's bosses the Tasks sheet pins above its tasks, in date
 * order. A boss bound to a Canvas assignment is that assignment: its task
 * moves up into the band and is the boss's row, so the deliverable appears
 * once. An unbound boss (an in-class test) is a read-only milestone row. The
 * band follows the Lord tab and search, and shows felled bosses only when
 * completed work shows. Pure, so the band's rules are testable; the lens
 * (modules/ladder/tasks.tsx) draws it.
 */
import { type Boss, UNASSIGNED_LORD_ID } from "@/store/lord";

import type { Task } from "@/types/task";

export type BossBandEntry =
  | { kind: "task"; task: Task; boss: Boss }
  | { kind: "boss"; boss: Boss };

export function planBossBand(
  tasks: Task[],
  bosses: Boss[],
  view: { activeLordId: string | null; search?: string; showDone: boolean }
): BossBandEntry[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const q = view.search?.trim().toLowerCase() ?? "";

  const band: BossBandEntry[] = [];
  for (const boss of bosses) {
    if (view.activeLordId === UNASSIGNED_LORD_ID) break;
    if (view.activeLordId && boss.lordId !== view.activeLordId) continue;

    const task = boss.boundTaskId ? byId.get(boss.boundTaskId) : undefined;
    if (task) {
      // The task passed the sheet's own filters, so it's shown — as the boss.
      band.push({ kind: "task", task, boss });
      continue;
    }
    // Bound, but its task is filtered out: the boss goes with it.
    if (boss.boundTaskId) continue;
    if (boss.felled && !view.showDone) continue;
    if (q && !boss.title.toLowerCase().includes(q)) continue;
    band.push({ kind: "boss", boss });
  }
  return band;
}
