import { NextRequest } from "next/server";

import { getDay } from "@/modules/nutrition/routes";

export async function GET(request: NextRequest) {
  return getDay(request);
}
