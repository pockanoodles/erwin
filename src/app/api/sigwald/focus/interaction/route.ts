import { NextRequest } from "next/server";

import { handleSigwaldFocusInteraction } from "@/lib/sigwald/focus-interaction";

const LOG_SOURCE = "SigwaldFocusInteractionAPI";

/**
 * POST /api/sigwald/focus/interaction
 * Logs TaskInteraction with context snapshot; COMPLETED/SKIPPED update the Task row.
 */
export async function POST(request: NextRequest) {
  return handleSigwaldFocusInteraction(request, LOG_SOURCE);
}
