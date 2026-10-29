/**
 * Attention list: open work the ranker structurally can't surface.
 *
 * Stage 1 ranking gives an undated task zero deadline pressure, so a
 * goal-linked task with no due date competes on importance alone and loses to
 * anything with a date. And an overdue task keeps losing impact every day it
 * stays late (`effectiveGradeImpact`), so it can sink out of the top card too.
 * Both failure modes are silent inside Focus. This module names them so a
 * caller (the ops morning brief) can say so out loud.
 *
 * Pure — the route loads rows, this only classifies.
 */

const MS_PER_DAY = 86_400_000;

export interface AttentionGoal {
  title: string;
  externalId: string | null;
  isBoss: boolean;
  targetDate: Date | null;
  /** Direct children in the goal DAG: a top goal's milestones live here. */
  children: AttentionGoal[];
}

export interface AttentionTaskInput {
  id: string;
  title: string;
  dueDate: Date | null;
  goals: AttentionGoal[];
}

export interface AttentionGoalRef {
  title: string;
  /** Vault slug for projected goals ("coop-2027"), null for hand-made ones. */
  slug: string | null;
}

export interface AttentionHorizon {
  title: string;
  date: string;
}

export interface OverdueItem {
  id: string;
  title: string;
  dueDate: string;
  daysLate: number;
  goals: AttentionGoalRef[];
}

export interface UndatedGoalItem {
  id: string;
  title: string;
  goals: AttentionGoalRef[];
  /** Nearest upcoming dated goal or boss this task serves — the real deadline it's drifting toward. */
  horizon: AttentionHorizon | null;
}

export interface AttentionResult {
  overdue: OverdueItem[];
  undatedGoalTasks: UndatedGoalItem[];
}

function slugOf(externalId: string | null): string | null {
  if (!externalId?.startsWith("venture:")) {
    return null;
  }
  return externalId.slice("venture:".length).split("#")[0] || null;
}

function goalRefs(goals: AttentionGoal[]): AttentionGoalRef[] {
  return goals.map((g) => ({ title: g.title, slug: slugOf(g.externalId) }));
}

/**
 * A goal's own target date, or the earliest upcoming one among its direct
 * boss children. Only direct bosses count: a goal's child goals (bcf-2026
 * under coop-2027) have their own deadlines, which aren't this task's.
 */
function horizonFor(goals: AttentionGoal[], now: Date): AttentionHorizon | null {
  let best: { title: string; date: Date } | null = null;
  for (const goal of goals) {
    const candidates = [goal, ...goal.children.filter((c) => c.isBoss)];
    for (const c of candidates) {
      if (!c.targetDate || c.targetDate.getTime() < now.getTime()) {
        continue;
      }
      if (!best || c.targetDate.getTime() < best.date.getTime()) {
        best = { title: c.title, date: c.targetDate };
      }
    }
  }
  return best ? { title: best.title, date: best.date.toISOString() } : null;
}

export function computeAttention(
  tasks: AttentionTaskInput[],
  now: Date
): AttentionResult {
  const overdue: OverdueItem[] = [];
  const undatedGoalTasks: UndatedGoalItem[] = [];

  for (const task of tasks) {
    if (task.dueDate) {
      const lateMs = now.getTime() - task.dueDate.getTime();
      if (lateMs > 0) {
        overdue.push({
          id: task.id,
          title: task.title,
          dueDate: task.dueDate.toISOString(),
          daysLate: Math.floor(lateMs / MS_PER_DAY),
          goals: goalRefs(task.goals),
        });
      }
    } else if (task.goals.length > 0) {
      undatedGoalTasks.push({
        id: task.id,
        title: task.title,
        goals: goalRefs(task.goals),
        horizon: horizonFor(task.goals, now),
      });
    }
  }

  overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  undatedGoalTasks.sort((a, b) => {
    const ha = a.horizon?.date ?? "￿";
    const hb = b.horizon?.date ?? "￿";
    return ha === hb ? a.title.localeCompare(b.title) : ha.localeCompare(hb);
  });

  return { overdue, undatedGoalTasks };
}
