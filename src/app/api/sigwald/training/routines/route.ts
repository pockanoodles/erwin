import { NextRequest } from "next/server";

import { createRoutine, listRoutines } from "@/modules/training/routes";

export async function GET(request: NextRequest) {
  return listRoutines(request);
}

export async function POST(request: NextRequest) {
  return createRoutine(request);
}
