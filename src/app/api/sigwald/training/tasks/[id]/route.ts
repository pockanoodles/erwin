import { NextRequest } from "next/server";

import { taskRoutine } from "@/modules/training/routes";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return taskRoutine(request, ctx);
}
