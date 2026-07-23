/**
 * Goal cycle helpers: enforce "one active cycle at a time" per user.
 */

import type { Prisma } from "@prisma/client";

/**
 * Archives any currently-active cycles for a user (except `exceptId` when
 * re-activating an existing one). Runs inside the caller's transaction so
 * activation is atomic.
 */
export async function deactivateActiveCycles(
  tx: Prisma.TransactionClient,
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
