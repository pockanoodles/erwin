import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { computeFocusBriefing } from "@/lib/erwin/briefing";
import {
  filterTasksForRanking,
  isDangerForFocus,
  orderTasksStage1,
  type TaskForRanking,
} from "@/lib/erwin/rank-stage1";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinFocusQueueAPI";

function toRankingRow(r: {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  unlockAt: Date | null;
  lockAt: Date | null;
  duration: number | null;
  gradeImpactScore: number | null;
  submissionStatus: string | null;
  source: string | null;
}): TaskForRanking {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    dueDate: r.dueDate,
    unlockAt: r.unlockAt,
    lockAt: r.lockAt,
    duration: r.duration,
    gradeImpactScore: r.gradeImpactScore,
    submissionStatus: r.submissionStatus,
    source: r.source,
  };
}

/**
 * GET /api/erwin/focus/queue
 * Returns Stage 1–ranked open tasks (full rows + tags/project) and briefing stats.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const now = newDate();

    const rows = await prisma.task.findMany({
      where: {
        userId,
        status: { not: "completed" },
      },
      include: {
        tags: true,
        project: true,
      },
    });

    const minimal = rows.map((r) => toRankingRow(r));
    const filtered = filterTasksForRanking(minimal, now);
    const ordered = orderTasksStage1(filtered, now);
    const idOrder = ordered.map((t) => t.id);
    const rankedFull = idOrder
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is (typeof rows)[number] => Boolean(r));

    const ranked = rankedFull.map((t) => ({
      ...t,
      erwin: {
        danger: isDangerForFocus(toRankingRow(t), now),
      },
    }));

    const briefing = computeFocusBriefing(filtered, now);

    return NextResponse.json({ ranked, briefing });
  } catch (error) {
    logger.error(
      "Erwin focus queue failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load focus queue" },
      { status: 500 }
    );
  }
}
