/**
 * Goal cycle helpers: enforce "one active cycle at a time" per user.
 */

import type { DbTransaction } from "@/lib/prisma";

/**
 * Archives any currently-active cycles for a user (except `exceptId` when
 * re-activating an existing one). Runs inside the caller's transaction so
 * activation is atomic.
 */
export async function deactivateActiveCycles(
  tx: DbTransaction,
  userId: string,
  exceptId?: string
): Promise<void> {
  await tx.goalCycle.updateMany({
    where: {
      userId,
      status: "active",
      ...(exceptId && { id: { not: exceptId } }),
    },
    data: { status: "archived" },
  });
}
