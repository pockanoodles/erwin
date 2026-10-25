import { NextRequest } from "next/server";

import { createPerson, listPeople } from "@/modules/people/routes";

export async function GET(request: NextRequest) {
  return listPeople(request);
}

export async function POST(request: NextRequest) {
  return createPerson(request);
}
