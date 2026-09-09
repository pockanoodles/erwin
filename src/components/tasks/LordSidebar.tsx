"use client";

import { useIsMobile } from "@/hooks/use-media-query";
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

/** Tasks-page sections come from the goals map: one section per Lord (root
 *  goal of the active hex), covering every boss and task on its path.
 *
 *  Two shapes, one list. A 224px column is a quarter of a laptop and well over
 *  half a phone, so below `md` the same entries render as a horizontal chip
 *  strip above the sheet. Hiding it outright was the cheaper fix and the wrong
 *  one — the Lord filter is how you make a 200-row list legible, which matters
 *  more on a small screen, not less. */
export function LordSidebar() {
  const { lords, activeLordId, setActiveLordId } = useLordStore();
  const { tasks } = useTaskStore();
  const isMobile = useIsMobile();

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

  const count = (n?: number) =>
    n !== undefined && n > 0 ? (
      <span className="flex-none font-mono text-xs text-muted-foreground">
        {n}
      </span>
    ) : null;

  if (isMobile) {
    return (
      <div className="flex flex-none gap-1.5 overflow-x-auto border-b border-border px-2 py-2">
        {entries.map((e) => (
          <button
            key={e.key}
            onClick={e.onClick}
            className={cn(
              "flex h-9 flex-none items-center gap-1.5 whitespace-nowrap border px-3 text-sm transition-colors duration-150",
              e.selected
                ? "border-foreground bg-foreground font-medium text-background"
                : "border-border text-muted-foreground"
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
      </div>
    );
  }

  return (
    <div className="flex w-sidebar flex-none flex-col border-r border-border bg-background">
      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        {entries.map((e) => (
          <button
            key={e.key}
            onClick={e.onClick}
            className={cn(
              "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors duration-150",
              e.selected
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span className="min-w-0 truncate">{e.label}</span>
            {count(e.count)}
          </button>
        ))}
        {lords.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No Lords yet — mint them on the map.
          </p>
        ) : null}
      </div>
    </div>
  );
}
