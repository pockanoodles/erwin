"use client";

import { useEffect } from "react";

import { cn } from "@/lib/utils";

import {
  NO_GOAL_TAB,
  type TopGoal,
  useGoalTabStore,
} from "@/modules/ladder/goal-tabs";

import { useTaskStore } from "@/store/task";

import { TaskStatus } from "@/types/task";

interface TabEntry {
  key: string;
  label: string;
  selected: boolean;
  onClick: () => void;
  count?: number;
}

/** Ladder's tabs on the Tasks page (its Tasks lens, modules/ladder/tasks):
 *  one per top goal of the running cycle, covering every task on its path —
 *  laid out as a spreadsheet sheet-tab strip along the bottom of the table.
 *  One shape at every width, so the filter never costs a column of
 *  horizontal space. Drawn whenever Ladder is on, so it's what keeps the
 *  goals fresh for the rest of the page. */
export function GoalTabs() {
  const { topGoals, activeId, setActiveId, load } = useGoalTabStore();
  const { tasks } = useTaskStore();

  useEffect(() => {
    void load();
  }, [load]);

  const openTasks = tasks.filter((t) => t.status !== TaskStatus.COMPLETED);
  const openCountFor = (goal: TopGoal) => {
    const goalIds = new Set(goal.goalIds);
    return openTasks.filter((t) =>
      t.goalLinks?.some((link) => goalIds.has(link.goalId))
    ).length;
  };
  const noGoalCount = openTasks.filter((t) => !t.goalLinks?.length).length;

  const entries: TabEntry[] = [
    {
      key: "all",
      label: "All tasks",
      selected: activeId === null,
      onClick: () => setActiveId(null),
      count: openTasks.length,
    },
    ...topGoals.map((goal) => ({
      key: goal.id,
      label: goal.title,
      selected: activeId === goal.id,
      onClick: () => setActiveId(goal.id),
      count: openCountFor(goal),
    })),
    {
      key: NO_GOAL_TAB,
      label: "No goal",
      selected: activeId === NO_GOAL_TAB,
      onClick: () => setActiveId(NO_GOAL_TAB),
      count: noGoalCount,
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
              ? "bg-foreground font-medium text-background"
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
      {topGoals.length === 0 ? (
        <span className="flex h-9 flex-none items-center px-3 text-xs text-muted-foreground">
          No goals in this cycle yet. Add them on the Ladder.
        </span>
      ) : null}
    </div>
  );
}
