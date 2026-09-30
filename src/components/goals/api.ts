/** Mutations shared by the Goals list and map views. Each throws on a
 *  non-OK response with the server's message so callers can toast it.
 *  Creators return the created entity so views can insert it locally
 *  instead of refetching the whole overview. */

import type { GoalFormValues } from "./GoalForm";
import type { GoalTask, OverviewGoal } from "./types";

async function expectOk(res: Response): Promise<Response> {
  if (!res.ok) {
    throw new Error((await res.text()) || `Request failed (${res.status})`);
  }
  return res;
}

interface GoalResponse {
  id: string;
  sortOrder?: number;
  title: string;
  whyItMatters: string | null;
  definitionOfDone: string | null;
  status: string;
  importanceScore: number | null;
  develops: string[];
  isBoss: boolean;
  targetDate: string | null;
  parentLinks?: Array<{ parentId: string }>;
}

function toOverviewGoal(json: GoalResponse): OverviewGoal {
  return {
    id: json.id,
    sortOrder: json.sortOrder ?? 0,
    title: json.title,
    whyItMatters: json.whyItMatters ?? null,
    definitionOfDone: json.definitionOfDone ?? null,
    status: json.status,
    importanceScore: json.importanceScore ?? null,
    develops: json.develops ?? [],
    isBoss: json.isBoss ?? false,
    targetDate: json.targetDate ?? null,
    // Hand-made goals (the only ones this client writes) never bind.
    boundTaskId: null,
    parentGoalIds: (json.parentLinks ?? []).map((link) => link.parentId),
    tasks: [],
  };
}

export async function createGoal(
  values: Partial<GoalFormValues> & { title: string; parentGoalIds?: string[] }
): Promise<OverviewGoal> {
  const res = await expectOk(
    await fetch("/api/erwin/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
  );
  return toOverviewGoal(await res.json());
}

export async function updateGoal(
  id: string,
  values: Partial<GoalFormValues>
): Promise<void> {
  await expectOk(
    await fetch(`/api/erwin/goals/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
  );
}

export async function deleteGoal(id: string): Promise<void> {
  await expectOk(await fetch(`/api/erwin/goals/${id}`, { method: "DELETE" }));
}

/** Persist manual list positions (0 = top). */
export async function reorderGoals(orderedGoalIds: string[]): Promise<void> {
  await expectOk(
    await fetch("/api/erwin/goals/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedGoalIds }),
    })
  );
}

/** Add a parent→child edge to the goal DAG. */
export async function linkGoals(
  parentGoalId: string,
  childGoalId: string
): Promise<void> {
  await expectOk(
    await fetch("/api/erwin/goals/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentGoalId, childGoalId }),
    })
  );
}

export async function unlinkGoals(
  parentGoalId: string,
  childGoalId: string
): Promise<void> {
  await expectOk(
    await fetch(
      `/api/erwin/goals/links?parentGoalId=${parentGoalId}&childGoalId=${childGoalId}`,
      { method: "DELETE" }
    )
  );
}

/** Link a task to one goal (a task can serve several). */
export async function linkTask(taskId: string, goalId: string): Promise<void> {
  await expectOk(
    await fetch("/api/erwin/task-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, goalId }),
    })
  );
}

export async function unlinkTask(
  taskId: string,
  goalId: string
): Promise<void> {
  await expectOk(
    await fetch(`/api/erwin/task-links?taskId=${taskId}&goalId=${goalId}`, {
      method: "DELETE",
    })
  );
}

/** Unlink a task from every goal. */
export async function clearTaskGoals(taskId: string): Promise<void> {
  await expectOk(
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalId: null }),
    })
  );
}

export async function createTask(
  title: string,
  goalId: string
): Promise<GoalTask> {
  const res = await expectOk(
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, status: "todo", goalId }),
    })
  );
  const json = await res.json();
  return {
    id: json.id,
    title: json.title,
    status: json.status ?? "todo",
    dueDate: json.dueDate ?? null,
    urgencyTier: json.urgencyTier ?? null,
  };
}

export async function updateTaskTitle(
  taskId: string,
  title: string
): Promise<void> {
  await expectOk(
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
  );
}

export async function deleteTask(taskId: string): Promise<void> {
  await expectOk(await fetch(`/api/tasks/${taskId}`, { method: "DELETE" }));
}

export async function updateCycle(
  cycleId: string,
  values: { theme?: string; focusStats?: string[] }
): Promise<void> {
  await expectOk(
    await fetch(`/api/erwin/cycles/${cycleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
  );
}
