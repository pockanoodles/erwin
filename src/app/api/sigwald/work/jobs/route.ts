import { NextRequest } from "next/server";

import { createJob, listJobs } from "@/modules/work/routes";

export async function GET(request: NextRequest) {
  return listJobs(request);
}

export async function POST(request: NextRequest) {
  return createJob(request);
}
