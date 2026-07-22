import { NextRequest } from "next/server";

import { handleErwinFocusInteraction } from "@/lib/erwin/focus-interaction";

const LOG_SOURCE = "ErwinFocusInteractAPI";

/**
 * POST /api/erwin/focus/interact — alias for `/interaction` (docs/focus-mode.md §2.7).
 */
export async function POST(request: NextRequest) {
  return handleErwinFocusInteraction(request, LOG_SOURCE);
}
