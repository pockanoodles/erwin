import { NextRequest } from "next/server";

import { createShift } from "@/modules/work/routes";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return createShift(request, ctx);
}
