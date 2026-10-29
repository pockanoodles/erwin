import { NextRequest } from "next/server";

import { updateFood } from "@/modules/nutrition/routes";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return updateFood(request, ctx);
}
