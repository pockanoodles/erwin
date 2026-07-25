"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

import { UNASSIGNED_LORD_ID, useLordStore, type Lord } from "@/store/lord";
import { useTaskStore } from "@/store/task";

import { TaskStatus } from "@/types/task";

/** Tasks-page sections come from the goals map: one section per Lord (root
 *  goal of the active hex), covering every boss and task on its path. */
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
  const unassignedCount = openTasks.filter(
    (t) => !t.goalLinks?.length
  ).length;

  const item = (
    key: string,
    label: React.ReactNode,
    selected: boolean,
    onClick: () => void,
    count?: number
  ) => (
    <button
      key={key}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors duration-150",
        selected
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined && count > 0 ? (
        <span className="flex-none font-mono text-xs text-muted-foreground">
          {count}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="flex w-64 flex-none flex-col border-r border-border bg-background">
      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        <p className="px-3 pb-1 pt-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">
          Lords
        </p>
        {item(
          "all",
          "All tasks",
          activeLordId === null,
          () => setActiveLordId(null),
          openTasks.length
        )}
        {lords.map((lord) =>
          item(
            lord.id,
            <>
              {lord.isBoss ? "⚔ " : ""}
              {lord.title}
            </>,
            activeLordId === lord.id,
            () => setActiveLordId(lord.id),
            openCountFor(lord)
          )
        )}
        {item(
          UNASSIGNED_LORD_ID,
          "Unassigned",
          activeLordId === UNASSIGNED_LORD_ID,
          () => setActiveLordId(UNASSIGNED_LORD_ID),
          unassignedCount
        )}
        {lords.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No Lords yet — mint them on the map.
          </p>
        ) : null}
      </div>
      <div className="border-t border-border p-3">
        <Link
          href="/goals"
          className="block px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Manage on the map →
        </Link>
      </div>
    </div>
  );
}
