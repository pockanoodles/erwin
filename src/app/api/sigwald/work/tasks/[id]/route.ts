import { NextRequest } from "next/server";

import { taskTimesheet } from "@/modules/work/routes";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return taskTimesheet(request, ctx);
}
