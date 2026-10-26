import type { Db, DbTransaction } from "@/lib/prisma";

/** The zone someone's days are counted in (their Settings), or UTC with none. */
export async function userTimeZone(
  db: Db | DbTransaction,
  userId: string
): Promise<string> {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  return settings?.timeZone || "UTC";
}
