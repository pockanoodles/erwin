import { NextRequest } from "next/server";

import { removeWorkout, updateWorkout } from "@/modules/training/routes";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return updateWorkout(request, ctx);
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return removeWorkout(request, ctx);
}
