import { NextRequest } from "next/server";

import { createWorkout, listRoutineWorkouts } from "@/modules/training/routes";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return listRoutineWorkouts(request, ctx);
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return createWorkout(request, ctx);
}
