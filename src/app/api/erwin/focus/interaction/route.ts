import { NextRequest } from "next/server";

import { handleErwinFocusInteraction } from "@/lib/erwin/focus-interaction";

const LOG_SOURCE = "ErwinFocusInteractionAPI";

/**
 * POST /api/erwin/focus/interaction
 * Logs TaskInteraction with context snapshot; COMPLETED/SKIPPED update the Task row.
 */
export async function POST(request: NextRequest) {
  return handleErwinFocusInteraction(request, LOG_SOURCE);
}
