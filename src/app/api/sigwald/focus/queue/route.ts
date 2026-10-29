import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { enrichFocusTaskDisplay } from "@/lib/sigwald/enrich-focus-task";
import {
  buildFocusQueueCore,
  computeBriefingStripFromCore,
} from "@/lib/sigwald/focus-queue-core";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "SigwaldFocusQueueAPI";

/**
 * GET /api/sigwald/focus/queue
 * Returns Stage 1–ranked open tasks (full rows + tags/project, plus what the
 * modules add to each), briefing strip, and display metadata.
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
    const rowById = new Map(core.rows.map((r) => [r.id, r]));

    const ranked = core.ordered.flatMap((t) => {
      const row = rowById.get(t.id);
      if (!row) {
        return [];
      }
      const m = core.meta.get(t.id);
      const danger = m?.danger ?? false;
      const sigwald = {
        danger,
        urgencyTier: m?.urgencyTier ?? "NONE",
        baseScore: m?.baseScore ?? 0,
        // Counted down to the moment it's due by, not the stored date.
        ...enrichFocusTaskDisplay(
          { ...row, dueDate: t.dueDate },
          now,
          core.timeZone
        ),
      };
      return [
        {
          ...row,
          ...core.facts.get(t.id),
          sigwald,
          // The pre-1.0 name, for ops until it reads `sigwald` (next.config.js).
          erwin: sigwald,
        },
      ];
    });

    const briefing = computeBriefingStripFromCore(core, now);

    return NextResponse.json({ ranked, briefing });
  } catch (error) {
    logger.error(
      "Sigwald focus queue failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load focus queue" },
      { status: 500 }
    );
  }
}
