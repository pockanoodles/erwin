/** Mutations shared by the Goals list and map views. Each throws on a
 *  non-OK response with the server's message so callers can toast it. */

import type { GoalFormValues } from "./GoalForm";

async function expectOk(res: Response): Promise<Response> {
  if (!res.ok) {
    throw new Error((await res.text()) || `Request failed (${res.status})`);
  }
  return res;
}

export async function createGoal(
  values: Partial<GoalFormValues> & { title: string; parentGoalId?: string }
): Promise<void> {
  await expectOk(
    await fetch("/api/erwin/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
  );
}

export async function updateGoal(
  id: string,
  values: Partial<GoalFormValues> & { parentGoalId?: string | null }
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

/** Link (or with null, unlink) a task to a goal. */
export async function setTaskGoal(
  taskId: string,
  goalId: string | null
): Promise<void> {
  await expectOk(
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalId }),
    })
  );
}

export async function createTask(
  title: string,
  goalId: string
): Promise<void> {
  await expectOk(
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, status: "todo", goalId }),
    })
  );
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

export async function updateCycleTheme(
  cycleId: string,
  theme: string
): Promise<void> {
  await expectOk(
    await fetch(`/api/erwin/cycles/${cycleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    })
  );
}
