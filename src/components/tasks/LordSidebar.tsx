"use client";

import { cn } from "@/lib/utils";

import { UNASSIGNED_LORD_ID, useLordStore, type Lord } from "@/store/lord";
import { useTaskStore } from "@/store/task";

import { TaskStatus } from "@/types/task";

interface LordEntry {
  key: string;
  label: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  count?: number;
}

/** Tasks-page tabs come from the goals map: one tab per Lord (root goal of
 *  the active hex), covering every boss and task on its path — laid out as
 *  a spreadsheet sheet-tab strip along the bottom of the table. One shape at
 *  every width, so the filter never costs a column of horizontal space. */
export function LordSidebar() {
  const { lords, activeLordId, setActiveLordId } = useLordStore();
  const { tasks } = useTaskStore();

  const openTasks = tasks.filter((t) => t.status !== TaskStatus.COMPLETED);
  const openCountFor = (lord: Lord) => {
    const goalIds = new Set(lord.goalIds);
    return openTasks.filter((t) =>
      t.goalLinks?.some((link) => goalIds.has(link.goalId))
    ).length;
  };
  const unassignedCount = openTasks.filter((t) => !t.goalLinks?.length).length;

  const entries: LordEntry[] = [
    {
      key: "all",
      label: "All tasks",
      selected: activeLordId === null,
      onClick: () => setActiveLordId(null),
      count: openTasks.length,
    },
    ...lords.map((lord) => ({
      key: lord.id,
      label: (
        <>
          {lord.isBoss ? "⚔ " : ""}
          {lord.title}
        </>
      ),
      selected: activeLordId === lord.id,
      onClick: () => setActiveLordId(lord.id),
      count: openCountFor(lord),
    })),
    {
      key: UNASSIGNED_LORD_ID,
      label: "Unassigned",
      selected: activeLordId === UNASSIGNED_LORD_ID,
      onClick: () => setActiveLordId(UNASSIGNED_LORD_ID),
      count: unassignedCount,
    },
  ];

  return (
    <div className="flex flex-none items-stretch overflow-x-auto border-t border-border bg-background">
      {entries.map((e) => (
        <button
          key={e.key}
          onClick={e.onClick}
          className={cn(
            "flex h-9 flex-none items-center gap-1.5 whitespace-nowrap border-r border-border px-3 text-sm transition-colors duration-150",
            e.selected
              ? "bg-cobalt font-medium text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <span>{e.label}</span>
          {e.count !== undefined && e.count > 0 ? (
            <span
              className={cn(
                "font-mono text-xs",
                e.selected ? "text-background/70" : "text-muted-foreground"
              )}
            >
              {e.count}
            </span>
          ) : null}
        </button>
      ))}
      {lords.length === 0 ? (
        <span className="flex h-9 flex-none items-center px-3 text-xs text-muted-foreground">
          No Lords yet — mint them on the map.
        </span>
      ) : null}
    </div>
  );
}
