import { NextRequest } from "next/server";

import { createInteraction, listInteractions } from "@/modules/people/routes";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return listInteractions(request, ctx);
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  return createInteraction(request, ctx);
}
