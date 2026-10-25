import type { Db, DbTransaction } from "@/lib/prisma";

/**
 * Files tasks under the goals the vault says they serve. Both rules are
 * declared in ~/brain and projected by pump 7; Erwin only applies them.
 *
 *  - A Lord claims every task whose source it names: its own
 *    "venture:<slug>" (tasks pump 2 decomposed from it) or one of its
 *    `sources:` (School claims CANVAS).
 *  - A boss that names a Canvas assignment claims that task, and Canvas wins
 *    on the facts: the task's due date becomes the boss's date, and
 *    submitting it fells the boss, which pays its XP (lib/erwin/xp.ts). A
 *    boss with no assignment is felled by the ✅ on its vault heading.
 *
 * Runs after every projection and every Canvas sync, so a new assignment is
 * filed the moment it lands rather than at 06:55 the next morning. A task
 * whose goal was picked by hand is pinned and never touched. Every link on
 * an unpinned task belongs to these rules, so one no rule produces anymore is
 * removed.
 */

const PROJECTION_PREFIX = "venture:";

export interface BossBinding {
  goalId: string;
  externalId: string;
  canvasAssignmentId: string;
  /** Null when no Canvas task has that id: the vault names one Erwin lacks. */
  task: { id: string; dueDate: Date | null; completed: boolean } | null;
}

export interface GoalRulesResult {
  linked: number;
  unlinked: number;
  bindings: BossBinding[];
}

/**
 * A timestamp's calendar day on this machine, which runs in Kaito's zone. A
 * Canvas "11:59 PM" due time is 04:59 UTC the next day, so slicing the ISO
 * string would put the boss a day late.
 */
export const calendarDay = (d: Date) => d.toLocaleDateString("en-CA");

/** Goal target dates are date-only, stored at noon UTC like pump 7 sends them
 *  so they read as the same day in any US zone. */
const bossDate = (due: Date) => new Date(`${calendarDay(due)}T12:00:00.000Z`);

interface RuleGoal {
  id: string;
  externalId: string | null;
  isBoss: boolean;
  taskSources: string[];
}

interface RuleTask {
  id: string;
  source: string | null;
  goalLinks: { id: string; goalId: string }[];
}

/**
 * The link changes that bring unpinned tasks in line with the rules: links
 * to add, and ids of links no rule produces. Pure, so the rules are testable.
 */
export function planLinks(
  goals: RuleGoal[],
  bossesByTask: Map<string, string[]>,
  tasks: RuleTask[]
): { create: { taskId: string; goalId: string }[]; stale: string[] } {
  const lordsBySource = new Map<string, string[]>();
  const claim = (source: string, goalId: string) =>
    lordsBySource.set(source, [...(lordsBySource.get(source) ?? []), goalId]);
  for (const g of goals) {
    if (g.isBoss || !g.externalId) continue;
    claim(g.externalId, g.id);
    for (const source of g.taskSources) claim(source, g.id);
  }

  const create: { taskId: string; goalId: string }[] = [];
  const stale: string[] = [];
  for (const task of tasks) {
    const desired = new Set([
      ...(task.source ? (lordsBySource.get(task.source) ?? []) : []),
      ...(bossesByTask.get(task.id) ?? []),
    ]);
    const have = new Set(task.goalLinks.map((l) => l.goalId));
    for (const goalId of desired) {
      if (!have.has(goalId)) create.push({ taskId: task.id, goalId });
    }
    for (const link of task.goalLinks) {
      if (!desired.has(link.goalId)) stale.push(link.id);
    }
  }
  return { create, stale };
}

export async function applyGoalRules(
  db: Db | DbTransaction,
  userId: string,
  scope: { taskIds?: string[] } = {}
): Promise<GoalRulesResult> {
  const goals = await db.goal.findMany({
    where: { userId, externalId: { startsWith: PROJECTION_PREFIX } },
    select: {
      id: true,
      externalId: true,
      isBoss: true,
      taskSources: true,
      canvasAssignmentId: true,
    },
  });

  const bound = goals.filter(
    (g): g is typeof g & { externalId: string; canvasAssignmentId: string } =>
      g.isBoss && Boolean(g.externalId) && Boolean(g.canvasAssignmentId)
  );
  const canvasTasks = bound.length
    ? await db.task.findMany({
        where: {
          userId,
          source: "CANVAS",
          externalTaskId: { in: bound.map((g) => g.canvasAssignmentId) },
        },
        select: { id: true, externalTaskId: true, dueDate: true, status: true, goalsPinned: true },
      })
    : [];
  const taskByAssignment = new Map(canvasTasks.map((t) => [t.externalTaskId, t]));

  const bindings: BossBinding[] = [];
  const bossesByTask = new Map<string, string[]>();
  for (const boss of bound) {
    const task = taskByAssignment.get(boss.canvasAssignmentId) ?? null;
    const completed = task?.status === "completed";
    bindings.push({
      goalId: boss.id,
      externalId: boss.externalId,
      canvasAssignmentId: boss.canvasAssignmentId,
      task: task && { id: task.id, dueDate: task.dueDate, completed },
    });
    if (!task) continue;
    await db.goal.update({
      where: { id: boss.id },
      data: {
        ...(task.dueDate && { targetDate: bossDate(task.dueDate) }),
        ...(completed && { status: "done" }),
      },
    });
    if (!task.goalsPinned) {
      bossesByTask.set(task.id, [...(bossesByTask.get(task.id) ?? []), boss.id]);
    }
  }

  const tasks = await db.task.findMany({
    where: {
      userId,
      goalsPinned: false,
      ...(scope.taskIds && { id: { in: scope.taskIds } }),
    },
    select: { id: true, source: true, goalLinks: { select: { id: true, goalId: true } } },
  });

  const { create, stale } = planLinks(goals, bossesByTask, tasks);

  if (create.length) {
    await db.taskGoalLink.createMany({ data: create, skipDuplicates: true });
  }
  if (stale.length) {
    await db.taskGoalLink.deleteMany({ where: { id: { in: stale } } });
  }

  return { linked: create.length, unlinked: stale.length, bindings };
}
