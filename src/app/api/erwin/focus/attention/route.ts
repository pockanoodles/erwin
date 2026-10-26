import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { type AttentionGoal, computeAttention } from "@/lib/erwin/attention";
import { dueBy } from "@/lib/erwin/due";
import { openWorkWhere } from "@/lib/erwin/open-work";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { userTimeZone } from "@/lib/user-time-zone";

import { moduleView } from "@/modules/state";

const LOG_SOURCE = "ErwinFocusAttentionAPI";

type GoalRow = {
  title: string;
  externalId: string | null;
  isBoss: boolean;
  targetDate: Date | null;
};

function toAttentionGoal(
  goal: GoalRow & { childLinks: Array<{ child: GoalRow }> }
): AttentionGoal {
  return {
    title: goal.title,
    externalId: goal.externalId,
    isBoss: goal.isBoss,
    targetDate: goal.targetDate,
    children: goal.childLinks.map(({ child }) => ({ ...child, children: [] })),
  };
}

/**
 * GET /api/erwin/focus/attention
 *
 * Open top-level tasks the Focus ranker can't surface on its own: overdue
 * ones (most late first) and goal-linked ones with no due date (nearest goal
 * horizon first). Same candidate pool as the focus queue (`openWorkWhere`):
 * not done or closed by Canvas, not a subtask, not postponed, already
 * unlocked. Feeds the ops morning brief.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const now = newDate();
    const [modules, timeZone] = await Promise.all([
      moduleView(auth.userId),
      userTimeZone(prisma, auth.userId),
    ]);
    const goalFields = {
      title: true,
      externalId: true,
      isBoss: true,
      targetDate: true,
    } as const;

    const rows = await prisma.task.findMany({
      where: openWorkWhere(auth.userId, now, modules.hidden),
      select: {
        id: true,
        title: true,
        source: true,
        dueDate: true,
        goalLinks: {
          where: { goal: { status: "active" } },
          select: {
            goal: {
              select: {
                ...goalFields,
                childLinks: { select: { child: { select: goalFields } } },
              },
            },
          },
        },
      },
    });

    const result = computeAttention(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        // A date with no time is late only once its day is over.
        dueDate: r.dueDate && dueBy(r.dueDate, r.source, timeZone),
        // With Ladder off, the attention list doesn't speak of goals.
        goals: modules.isOn("ladder")
          ? r.goalLinks.map((l) => toAttentionGoal(l.goal))
          : [],
      })),
      now
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      "Erwin focus attention failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load attention list" },
      { status: 500 }
    );
  }
}
