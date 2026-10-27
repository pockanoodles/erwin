import { NextRequest } from "next/server";

import { putContactRoster } from "@/modules/work/routes";

export async function PUT(request: NextRequest) {
  return putContactRoster(request);
}
