import { NextRequest } from "next/server";

import { listPeriods } from "@/modules/work/routes";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return listPeriods(request, ctx);
}
