"use client";

/**
 * Ladder on the Tasks page (its Tasks lens, components/tasks/lens.ts): a tab
 * per top goal that narrows the page to that goal's work, the Goal column
 * and picker that link a task to a goal by hand, and the goal on each row.
 * All of it leaves the page while Ladder is off. The milestones themselves,
 * with their proof and XP, live on the Ladder page.
 */
import { useMemo } from "react";

import { EMPTY, type TaskColumn } from "@/components/tasks/datasheet/columns";
import type { TasksLens } from "@/components/tasks/lens";

import { GoalPicker } from "@/modules/ladder/components/GoalPicker";
import { GoalTabs } from "@/modules/ladder/components/GoalTabs";
import {
  NO_GOAL_TAB,
  type TopGoal,
  filterTasksByGoal,
  topGoalOf,
  useGoalTabStore,
} from "@/modules/ladder/goal-tabs";

import { useModuleOn } from "@/store/modules";

/** The Goal editor's "let the goal rules decide" choice. */
const AUTO_GOALS = "__auto__";

export function goalColumn(topGoals: TopGoal[]): TaskColumn {
  return {
    id: "goal",
    label: "Goal",
    sortKey: "goal",
    width: 168,
    after: "duration",
    render: (t) => {
      const goal = topGoalOf(t, topGoals);
      if (goal) {
        return <span className="text-foreground">{goal.title}</span>;
      }
      // Linked to a goal of another cycle: not the same as no goal.
      if (t.goalLinks?.length) {
        return (
          <span
            className="italic text-muted-foreground"
            title="Linked to a goal from another cycle"
          >
            Other cycle
          </span>
        );
      }
      return EMPTY;
    },
    text: (t) =>
      topGoalOf(t, topGoals)?.title ??
      (t.goalLinks?.length ? "Other cycle" : ""),
    editor: {
      kind: "enum",
      options: () => [
        { value: AUTO_GOALS, label: "Automatic" },
        { value: "", label: "No goal" },
        ...topGoals.map((g) => ({ value: g.id, label: g.title })),
      ],
    },
    // An unpinned task's goal comes from the goal rules (a goal that claims
    // Canvas files every Canvas task), and the bar says so; picking any goal,
    // even the same one, pins it by hand.
    formValue: (t) =>
      t.goalsPinned ? (topGoalOf(t, topGoals)?.id ?? "") : AUTO_GOALS,
    // The API's single-goal setter replaces the task's links with one to the
    // chosen goal (empty clears them); `goalsPinned: true` makes choosing the
    // goal the rules already gave it count as a choice.
    commit: (raw, t) =>
      raw === AUTO_GOALS
        ? { ...t, goalsPinned: false }
        : { ...t, goalId: raw || null, goalsPinned: true },
    sortValue: (t) => topGoalOf(t, topGoals)?.title ?? null,
  };
}

export function useLadderTasksLens(): TasksLens | null {
  const on = useModuleOn("ladder");
  const topGoals = useGoalTabStore((s) => s.topGoals);
  const activeId = useGoalTabStore((s) => s.activeId);

  return useMemo(() => {
    if (on !== true) return null;
    return {
      filter: (tasks) => filterTasksByGoal(tasks, topGoals, activeId),
      Tabs: GoalTabs,
      // Creating inside a goal's tab links the task to that goal; "All tasks"
      // and "No goal" link nothing.
      newTaskGoalId:
        activeId && activeId !== NO_GOAL_TAB ? activeId : undefined,
      columns: [goalColumn(topGoals)],
      rowLabel: (task) => topGoalOf(task, topGoals)?.title ?? null,
      Control: GoalPicker,
    } satisfies TasksLens;
  }, [on, topGoals, activeId]);
}
