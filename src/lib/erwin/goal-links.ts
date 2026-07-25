import { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Erwin v3 goal DAG: goals within a cycle link parent→child many-to-many.
 * The one invariant the join table can't express is acyclicity — every edge
 * insert goes through `linkWouldCreateLoop` first.
 */

/**
 * Would adding parent→child close a loop? Loads the cycle's edge list in one
 * query and BFSes downward from `child`; reaching `parent` means `parent` is
 * already a descendant of `child`.
 */
export async function linkWouldCreateLoop(
  db: Db,
  cycleId: string,
  parentId: string,
  childId: string
): Promise<boolean> {
  if (parentId === childId) return true;

  const edges = await db.goalLink.findMany({
    where: { parent: { cycleId } },
    select: { parentId: true, childId: true },
  });

  const childrenOf = new Map<string, string[]>();
  for (const edge of edges) {
    const list = childrenOf.get(edge.parentId);
    if (list) list.push(edge.childId);
    else childrenOf.set(edge.parentId, [edge.childId]);
  }

  const queue = [childId];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const next of childrenOf.get(current) ?? []) {
      if (next === parentId) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}
