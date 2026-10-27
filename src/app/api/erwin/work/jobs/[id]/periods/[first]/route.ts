import { NextRequest } from "next/server";

import { markPeriod } from "@/modules/work/routes";

type Ctx = { params: Promise<{ id: string; first: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  return markPeriod(request, ctx, true);
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return markPeriod(request, ctx, false);
}
