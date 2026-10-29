import { NextRequest } from "next/server";

import { handleSigwaldFocusInteraction } from "@/lib/sigwald/focus-interaction";

const LOG_SOURCE = "SigwaldFocusInteractAPI";

/**
 * POST /api/sigwald/focus/interact — alias for `/interaction` (docs/focus-mode.md §2.7).
 */
export async function POST(request: NextRequest) {
  return handleSigwaldFocusInteraction(request, LOG_SOURCE);
}
