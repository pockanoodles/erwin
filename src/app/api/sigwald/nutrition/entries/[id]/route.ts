import { NextRequest } from "next/server";

import { deleteEntry, updateEntry } from "@/modules/nutrition/routes";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return updateEntry(request, ctx);
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return deleteEntry(request, ctx);
}
