import { NextResponse } from "next/server";

import { moduleById } from "@/modules";
import { isModuleOn } from "@/modules/state";
import type { ModuleId } from "@/modules/types";

/**
 * What a module's API answers while it's off: a 409 that says so, so a
 * script calling it (ops) fails loudly instead of writing into a module
 * nobody can see. Null when the module is on.
 */
export async function moduleOffResponse(
  userId: string,
  id: ModuleId
): Promise<NextResponse | null> {
  if (await isModuleOn(userId, id)) return null;
  const { name } = moduleById(id);
  return NextResponse.json(
    {
      error: "module_off",
      module: id,
      message: `${name} is off. Turn it on in Modules.`,
    },
    { status: 409 }
  );
}
