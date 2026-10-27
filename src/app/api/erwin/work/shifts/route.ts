import { NextRequest } from "next/server";

import { listShifts } from "@/modules/work/routes";

export async function GET(request: NextRequest) {
  return listShifts(request);
}
