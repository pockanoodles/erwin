import { NextRequest } from "next/server";

import { createEntry } from "@/modules/nutrition/routes";

export async function POST(request: NextRequest) {
  return createEntry(request);
}
