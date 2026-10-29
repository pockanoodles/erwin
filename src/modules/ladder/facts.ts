/**
 * What Ladder tells the core about tasks (src/modules/server.ts): the goals
 * each task climbs toward, for Today and Focus to show, and how much its most
 * important active goal lifts it in Focus's ranking.
 */
import type { RankSignals } from "@/lib/sigwald/rank-stage1";
import type { Db } from "@/lib/prisma";

import type { FactsRequest, TaskFacts } from "@/modules/server";

/**
 * A task serves several goals; it surfaces on its most important one. A goal
 * done or set aside no longer makes its work matter more.
 */
export async function goalRankSignals(
  db: Db,
  userId: string,
  taskIds: string[]
): Promise<Map<string, RankSignals>> {
  const links = await db.taskGoalLink.findMany({
    where: {
      taskId: { in: taskIds },
      goal: { userId, status: "active", importanceScore: { not: null } },
    },
    select: { taskId: true, goal: { select: { importanceScore: true } } },
  });
  const lift = new Map<string, number>();
  for (const link of links) {
    const score = (link.goal.importanceScore ?? 0) / 100;
    lift.set(link.taskId, Math.max(lift.get(link.taskId) ?? score, score));
  }
  return new Map([...lift].map(([id, value]) => [id, { lift: value }]));
}

/** `ladderGoals`: every goal a task is filed under, done ones included. */
export async function goalTaskFacts(
  db: Db,
  userId: string,
  tasks: FactsRequest[]
): Promise<Map<string, TaskFacts>> {
  const links = await db.taskGoalLink.findMany({
    where: { taskId: { in: tasks.map((t) => t.id) }, goal: { userId } },
    select: {
      taskId: true,
      goal: {
        select: {
          id: true,
          title: true,
          isBoss: true,
          targetDate: true,
          externalId: true,
          importanceScore: true,
          develops: true,
          whyItMatters: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const goals = new Map<string, (typeof links)[number]["goal"][]>();
  for (const link of links) {
    goals.set(link.taskId, [...(goals.get(link.taskId) ?? []), link.goal]);
  }
  return new Map([...goals].map(([id, ladderGoals]) => [id, { ladderGoals }]));
}
