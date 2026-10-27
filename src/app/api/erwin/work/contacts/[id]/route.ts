import { NextRequest } from "next/server";

import { removeContact, updateContact } from "@/modules/work/routes";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  return updateContact(request, ctx);
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return removeContact(request, ctx);
}
