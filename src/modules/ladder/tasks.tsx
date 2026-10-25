"use client";

/**
 * Ladder on the Tasks page (its Tasks lens, components/tasks/lens.ts): tabs
 * that narrow the page to one Lord's path, the Lord column and picker, the
 * Lord on each row, and the hex's bosses pinned above the sheet. All of it
 * leaves the page while Ladder is off.
 */
import { useMemo } from "react";

import { EMPTY, type TaskColumn } from "@/components/tasks/datasheet/columns";
import type {
  BandItem,
  BandRow,
  RowMark,
  TasksLens,
} from "@/components/tasks/lens";

import { planBossBand } from "@/modules/ladder/boss-band";
import { BossPane, BossStrip } from "@/modules/ladder/components/BossPane";
import { LordPicker } from "@/modules/ladder/components/LordPicker";
import { LordTabs } from "@/modules/ladder/components/LordTabs";
import { bossCell, bossCellText } from "@/modules/ladder/components/boss-cells";

import {
  type Boss,
  type Lord,
  UNASSIGNED_LORD_ID,
  filterTasksByLord,
  useLordStore,
} from "@/store/lord";
import { useModuleOn } from "@/store/modules";

import type { Task } from "@/types/task";

/** The Lord editor's "let the vault's rules decide" choice. */
const AUTO_GOALS = "__auto__";

/** A task's Lord: the root whose path holds any goal it's linked to. */
const lordOf = (task: Task, lords: Lord[]) =>
  lords.find((lord) =>
    task.goalLinks?.some((link) => lord.goalIds.includes(link.goalId))
  );

export function lordColumn(lords: Lord[]): TaskColumn {
  return {
    id: "lord",
    label: "Lord",
    sortKey: "lord",
    width: 168,
    after: "duration",
    render: (t) => {
      const lord = lordOf(t, lords);
      if (lord) {
        return <span className="text-foreground">{lord.title}</span>;
      }
      // Linked to a goal outside the active hex's lords — not unassigned.
      if (t.goalLinks?.length) {
        return (
          <span
            className="italic text-muted-foreground"
            title="Linked to a goal outside the current hex"
          >
            Other hex
          </span>
        );
      }
      return EMPTY;
    },
    text: (t) =>
      lordOf(t, lords)?.title ?? (t.goalLinks?.length ? "Other hex" : ""),
    editor: {
      kind: "enum",
      options: () => [
        { value: AUTO_GOALS, label: "Auto (vault rules)" },
        { value: "", label: "Unassigned" },
        ...lords.map((l) => ({ value: l.id, label: l.title })),
      ],
    },
    // An unpinned task's Lord comes from the vault (School claims Canvas), and
    // the bar says so; picking any Lord, even the same one, pins it by hand.
    formValue: (t) =>
      t.goalsPinned ? (lordOf(t, lords)?.id ?? "") : AUTO_GOALS,
    // The API's single-goal setter replaces the task's links with one to the
    // chosen Lord (empty clears them); `goalsPinned: true` makes choosing the
    // Lord the rules already gave it count as a choice.
    commit: (raw, t) =>
      raw === AUTO_GOALS
        ? { ...t, goalsPinned: false }
        : { ...t, goalId: raw || null, goalsPinned: true },
    sortValue: (t) => lordOf(t, lords)?.title ?? null,
  };
}

const bossMark = (boss: Boss): RowMark => ({
  glyph: "⚔",
  title: `Boss: ${boss.title}`,
  strip: () => <BossStrip boss={boss} />,
});

const bossItem = (boss: Boss, lords: Lord[]): BandItem => ({
  key: boss.id,
  mark: { glyph: "⚔", title: `Boss: ${boss.title}` },
  done: boss.felled,
  cell: (column) => bossCell(boss, column, lords),
  text: (column) => bossCellText(boss, column, lords),
  pane: () => (
    <BossPane
      boss={boss}
      lordTitle={lords.find((l) => l.id === boss.lordId)?.title ?? null}
    />
  ),
});

/** The bosses the sheet pins (boss-band.ts), as rows the sheet draws. */
function bossBand(
  tasks: Task[],
  bosses: Boss[],
  lords: Lord[],
  view: { activeLordId: string | null; search?: string; showDone: boolean }
): BandRow[] {
  return planBossBand(tasks, bosses, view).map((entry) =>
    entry.kind === "task"
      ? { kind: "task", task: entry.task, mark: bossMark(entry.boss) }
      : { kind: "item", item: bossItem(entry.boss, lords) }
  );
}

export function useLadderTasksLens(): TasksLens | null {
  const on = useModuleOn("ladder");
  const lords = useLordStore((s) => s.lords);
  const bosses = useLordStore((s) => s.bosses);
  const activeLordId = useLordStore((s) => s.activeLordId);

  return useMemo(() => {
    if (on !== true) return null;
    return {
      filter: (tasks) => filterTasksByLord(tasks, lords, activeLordId),
      Tabs: LordTabs,
      // Creating inside a Lord's tab links the task to that Lord; "All" and
      // "Unassigned" link nothing.
      newTaskGoalId:
        activeLordId && activeLordId !== UNASSIGNED_LORD_ID
          ? activeLordId
          : undefined,
      columns: [lordColumn(lords)],
      rowLabel: (task) => lordOf(task, lords)?.title ?? null,
      Control: LordPicker,
      band: (tasks, view) =>
        bossBand(tasks, bosses, lords, { activeLordId, ...view }),
    } satisfies TasksLens;
  }, [on, lords, bosses, activeLordId]);
}
