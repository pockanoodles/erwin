import { NextRequest } from "next/server";

import { updateRoutine } from "@/modules/training/routes";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return updateRoutine(request, ctx);
}
