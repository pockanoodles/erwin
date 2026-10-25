/** Goal and hex mutations for the Ladder. Each throws on a non-OK response
 *  with the server's message, so callers can toast it. */

import type { GoalFormValues, GoalSources } from "./GoalForm";

async function expectOk(res: Response): Promise<Response> {
  if (!res.ok) {
    throw new Error((await res.text()) || `Request failed (${res.status})`);
  }
  return res;
}

export async function fetchGoal(id: string): Promise<GoalFormValues> {
  const res = await expectOk(await fetch(`/api/erwin/goals/${id}`));
  const json = await res.json();
  return {
    title: json.title,
    whyItMatters: json.whyItMatters ?? null,
    definitionOfDone: json.definitionOfDone ?? null,
    importanceScore: json.importanceScore ?? null,
    develops: json.develops ?? [],
    isBoss: json.isBoss ?? false,
    targetDate: json.targetDate ?? null,
    taskSources: json.taskSources ?? [],
    canvasAssignmentId: json.canvasAssignmentId ?? null,
    proofTaskId: json.proofTaskId ?? null,
    status: json.status ?? "active",
  };
}

export async function fetchGoalSources(): Promise<GoalSources> {
  const res = await expectOk(await fetch("/api/erwin/goals/sources"));
  return res.json();
}

export async function createGoal(
  values: GoalFormValues & { parentGoalIds?: string[] }
): Promise<void> {
  await expectOk(
    await fetch("/api/erwin/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
  );
}

export async function updateGoal(id: string, values: GoalFormValues): Promise<void> {
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
