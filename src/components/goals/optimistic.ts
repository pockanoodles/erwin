/** Pure overview transforms for optimistic updates. Each mirrors what the
 *  server will do, so the UI lands in the right state before (or without)
 *  a refetch; a failed request refetches to resync. */

import type {
  GoalTask,
  GoalsOverview,
  OverviewGoal,
  UnassignedTask,
} from "./types";

export function withGoalAdded(
  o: GoalsOverview,
  goal: OverviewGoal
): GoalsOverview {
  return { ...o, goals: [...o.goals, goal] };
}

export function withGoalUpdated(
  o: GoalsOverview,
  id: string,
  patch: Partial<OverviewGoal>
): GoalsOverview {
  return {
    ...o,
    goals: o.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
  };
}

/** Removes a goal: edges to it vanish, and tasks that were only linked to it
 *  fall back to the unassigned tray (matching the server's cascade). */
export function withGoalRemoved(o: GoalsOverview, id: string): GoalsOverview {
  const removed = o.goals.find((g) => g.id === id);
  const remaining = o.goals
    .filter((g) => g.id !== id)
    .map((g) =>
      g.parentGoalIds.includes(id)
        ? { ...g, parentGoalIds: g.parentGoalIds.filter((p) => p !== id) }
        : g
    );
  const stillLinked = new Set(
    remaining.flatMap((g) => g.tasks.map((t) => t.id))
  );
  const orphaned: UnassignedTask[] = (removed?.tasks ?? [])
    .filter(
      (t) =>
        !stillLinked.has(t.id) &&
        t.status !== "completed" &&
        !o.unassignedTasks.some((u) => u.id === t.id)
    )
    .map(({ id: taskId, title, dueDate, urgencyTier }) => ({
      id: taskId,
      title,
      dueDate,
      urgencyTier,
    }));
  return {
    ...o,
    goals: remaining,
    unassignedTasks: [...o.unassignedTasks, ...orphaned],
  };
}

export function withGoalLink(
  o: GoalsOverview,
  parentId: string,
  childId: string
): GoalsOverview {
  return {
    ...o,
    goals: o.goals.map((g) =>
      g.id === childId && !g.parentGoalIds.includes(parentId)
        ? { ...g, parentGoalIds: [...g.parentGoalIds, parentId] }
        : g
    ),
  };
}

export function withoutGoalLink(
  o: GoalsOverview,
  parentId: string,
  childId: string
): GoalsOverview {
  return {
    ...o,
    goals: o.goals.map((g) =>
      g.id === childId
        ? { ...g, parentGoalIds: g.parentGoalIds.filter((p) => p !== parentId) }
        : g
    ),
  };
}

export function withTaskAdded(
  o: GoalsOverview,
  goalId: string,
  task: GoalTask
): GoalsOverview {
  return {
    ...o,
    goals: o.goals.map((g) =>
      g.id === goalId && !g.tasks.some((t) => t.id === task.id)
        ? { ...g, tasks: [...g.tasks, task] }
        : g
    ),
  };
}

export function withTaskLinked(
  o: GoalsOverview,
  taskId: string,
  goalId: string
): GoalsOverview {
  const existing: GoalTask | null =
    o.goals.flatMap((g) => g.tasks).find((t) => t.id === taskId) ??
    o.unassignedTasks
      .filter((t) => t.id === taskId)
      .map((t) => ({ ...t, status: "todo" }))[0] ??
    null;
  if (!existing) return o;
  return {
    ...withTaskAdded(o, goalId, existing),
    unassignedTasks: o.unassignedTasks.filter((t) => t.id !== taskId),
  };
}

export function withTaskUnlinked(
  o: GoalsOverview,
  taskId: string,
  goalId: string | null // null = unlink from every goal
): GoalsOverview {
  let removed: GoalTask | null = null;
  const goals = o.goals.map((g) => {
    if (goalId !== null && g.id !== goalId) return g;
    const task = g.tasks.find((t) => t.id === taskId);
    if (!task) return g;
    removed = task;
    return { ...g, tasks: g.tasks.filter((t) => t.id !== taskId) };
  });
  if (!removed) return o;
  const task: GoalTask = removed;
  const stillLinked = goals.some((g) => g.tasks.some((t) => t.id === taskId));
  const toTray =
    !stillLinked &&
    task.status !== "completed" &&
    !o.unassignedTasks.some((t) => t.id === taskId);
  return {
    ...o,
    goals,
    unassignedTasks: toTray
      ? [
          ...o.unassignedTasks,
          {
            id: task.id,
            title: task.title,
            dueDate: task.dueDate,
            urgencyTier: task.urgencyTier,
          },
        ]
      : o.unassignedTasks,
  };
}

export function withTaskRenamed(
  o: GoalsOverview,
  taskId: string,
  title: string
): GoalsOverview {
  return {
    ...o,
    goals: o.goals.map((g) => ({
      ...g,
      tasks: g.tasks.map((t) => (t.id === taskId ? { ...t, title } : t)),
    })),
    unassignedTasks: o.unassignedTasks.map((t) =>
      t.id === taskId ? { ...t, title } : t
    ),
  };
}

/** Reorders the root goals (Lords) to match `orderedRootIds`; non-roots keep
 *  their relative order. Mirrors PUT /api/erwin/goals/reorder. */
export function withRootsReordered(
  o: GoalsOverview,
  orderedRootIds: string[]
): GoalsOverview {
  const position = new Map(orderedRootIds.map((id, index) => [id, index]));
  const roots = orderedRootIds
    .map((id) => o.goals.find((g) => g.id === id))
    .filter((g): g is OverviewGoal => g !== undefined)
    .map((g) => ({ ...g, sortOrder: position.get(g.id)! }));
  const rest = o.goals.filter((g) => !position.has(g.id));
  return { ...o, goals: [...roots, ...rest] };
}

export function withTaskRemoved(
  o: GoalsOverview,
  taskId: string
): GoalsOverview {
  return {
    ...o,
    goals: o.goals.map((g) => ({
      ...g,
      tasks: g.tasks.filter((t) => t.id !== taskId),
    })),
    unassignedTasks: o.unassignedTasks.filter((t) => t.id !== taskId),
  };
}
