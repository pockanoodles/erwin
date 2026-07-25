/** Shared shapes for the Goals page views (list + map), mirroring
 *  GET /api/erwin/goals/overview. */

export interface OverviewHex {
  year: number;
  index: number;
  label: string;
}

export interface OverviewCycle {
  id: string;
  theme: string;
  startDate: string;
  endDate: string;
  hex: OverviewHex;
}

export interface GoalTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  urgencyTier: string | null;
}

export interface OverviewGoal {
  id: string;
  title: string;
  whyItMatters: string | null;
  definitionOfDone: string | null;
  status: string;
  importanceScore: number | null;
  parentGoalId: string | null;
  tasks: GoalTask[];
}

export interface OverviewGroupTask {
  id: string;
  title: string;
  dueDate: string | null;
  urgencyTier: string | null;
}

export interface OverviewGroup {
  key: string;
  openCount: number;
  doneLast30: number;
  tasks: OverviewGroupTask[];
}

export interface UnassignedTask {
  id: string;
  title: string;
  dueDate: string | null;
  urgencyTier: string | null;
}

export interface GoalsOverview {
  activeCycle: OverviewCycle;
  groups: OverviewGroup[];
  goals: OverviewGoal[];
  unassignedTasks: UnassignedTask[];
}

/** Flat goals → children-by-parent lookup; top-level goals under `null`. */
export function goalChildren(
  goals: OverviewGoal[]
): Map<string | null, OverviewGoal[]> {
  const byParent = new Map<string | null, OverviewGoal[]>();
  for (const goal of goals) {
    const key = goal.parentGoalId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(goal);
    byParent.set(key, list);
  }
  return byParent;
}
