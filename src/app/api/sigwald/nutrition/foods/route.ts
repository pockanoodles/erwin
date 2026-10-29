import { NextRequest } from "next/server";

import { createFood, listFoods } from "@/modules/nutrition/routes";

export async function GET(request: NextRequest) {
  return listFoods(request);
}

export async function POST(request: NextRequest) {
  return createFood(request);
}
