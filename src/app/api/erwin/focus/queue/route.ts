import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { enrichFocusTaskDisplay } from "@/lib/erwin/enrich-focus-task";
import { loadGradeProjectionsForDangerTasks } from "@/lib/erwin/load-grade-projections";
import {
  buildFocusQueueCore,
  computeBriefingStripFromCore,
  toTaskForRanking,
} from "@/lib/erwin/focus-queue-core";
import { isDangerResolved } from "@/lib/erwin/rank-stage1";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "ErwinFocusQueueAPI";

/**
 * GET /api/erwin/focus/queue
 * Returns Stage 1–ranked open tasks (full rows + tags/project), briefing strip, and display metadata.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const now = newDate();

    const core = await buildFocusQueueCore(userId);

    const projections = await loadGradeProjectionsForDangerTasks(
      userId,
      core.rows,
      core.meta
    );

    const idOrder = core.ordered.map((t) => t.id);
    const rankedFull = idOrder
      .map((id) => core.rows.find((r) => r.id === id))
      .filter((r): r is (typeof core.rows)[number] => Boolean(r));

    const ranked = rankedFull.map((t) => {
      const m = core.meta.get(t.id);
      const danger =
        m?.danger ?? isDangerResolved(toTaskForRanking(t), now);
      const proj = projections.get(t.id) ?? null;
      const display = enrichFocusTaskDisplay(t, now, proj, { danger });

      return {
        ...t,
        erwin: {
          danger,
          urgencyTier: m?.urgencyTier ?? "NONE",
          baseScore: m?.baseScore ?? 0,
          ...display,
        },
      };
    });

    const briefing = computeBriefingStripFromCore(
      core.filtered,
      core.slotAware,
      core.availability,
      now
    );

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
