import { PrismaClient } from "@prisma/client";

import { credentialEncryption } from "@/lib/crypto/prisma-encryption";

// Properly handle connection lifecycle
function createPrismaClient() {
  const client = new PrismaClient({
    log: ["error"],
  });

  // Ensure connection is properly closed before process exits
  process.on("beforeExit", async () => {
    await client.$disconnect();
    console.log("[PrismaClient] Disconnected Prisma client before exit");
  });

  // Credential columns are encrypted at rest. Applied here rather than at each
  // call site so every consumer keeps reading plain `account.accessToken`, and
  // so no code that upstream also maintains has to change.
  return client.$extends(credentialEncryption);
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * The client type as the application actually sees it, extension included.
 *
 * Helpers that take a client or a transaction must use these rather than
 * `PrismaClient` / `Prisma.TransactionClient` from `@prisma/client`: those
 * describe the *unextended* client, and an extended client is not assignable
 * to them.
 */
export type Db = typeof prisma;

/** What `$transaction` hands its callback — a client minus the lifecycle verbs. */
export type DbTransaction = Omit<
  Db,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
