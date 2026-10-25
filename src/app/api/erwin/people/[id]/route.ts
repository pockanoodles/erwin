import { NextRequest } from "next/server";

import { updatePerson } from "@/modules/people/routes";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return updatePerson(request, ctx);
}
