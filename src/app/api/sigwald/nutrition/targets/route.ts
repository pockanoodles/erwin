import { NextRequest } from "next/server";

import { putTargets } from "@/modules/nutrition/routes";

export async function PUT(request: NextRequest) {
  return putTargets(request);
}
