import { NextRequest } from "next/server";

import { getSourceShifts, putShiftWeek } from "@/modules/work/routes";

// The schedule import's address, kept from before shifts were the Work
// module's so ops' shifts module calls it unchanged.

export async function PUT(request: NextRequest) {
  return putShiftWeek(request);
}

export async function GET(request: NextRequest) {
  return getSourceShifts(request);
}
