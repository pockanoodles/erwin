import { NextRequest } from "next/server";

import { removeShift, updateShift } from "@/modules/work/routes";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  return updateShift(request, ctx);
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return removeShift(request, ctx);
}
