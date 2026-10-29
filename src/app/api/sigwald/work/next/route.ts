import { NextRequest } from "next/server";

import { getNextShift } from "@/modules/work/routes";

export async function GET(request: NextRequest) {
  return getNextShift(request);
}
