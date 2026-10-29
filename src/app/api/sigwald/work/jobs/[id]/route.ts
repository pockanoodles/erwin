import { NextRequest } from "next/server";

import { removeJob, updateJob } from "@/modules/work/routes";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  return updateJob(request, ctx);
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  return removeJob(request, ctx);
}
