import { NextRequest } from "next/server";

import { listWorkouts } from "@/modules/training/routes";

export async function GET(request: NextRequest) {
  return listWorkouts(request);
}
