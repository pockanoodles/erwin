import { NextRequest } from "next/server";

import { createContact, listContacts } from "@/modules/work/routes";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return listContacts(request, ctx);
}

export async function POST(request: NextRequest, ctx: Ctx) {
  return createContact(request, ctx);
}
