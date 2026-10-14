import { hash } from "bcryptjs";

import { authenticateUser } from "@/lib/auth/credentials-provider";
import { prisma } from "@/lib/prisma";

/**
 * Password sign-in reads `User.passwordHash`. The upstream project kept that
 * hash in `Account.id_token` — an OAuth column on a synthetic
 * `provider = 'credentials'` row — and these tests pin the replacement: the
 * hash is read from the user, a user without one cannot sign in, and the hash
 * never leaves this function (its return value feeds the NextAuth JWT).
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const findUnique = prisma.user.findUnique as jest.Mock;

const PASSWORD = "Correct-Horse-1";
let passwordHash: string;

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "kaito@local",
    name: "Kaito",
    role: "user",
    passwordHash,
    ...overrides,
  };
}

beforeAll(async () => {
  passwordHash = await hash(PASSWORD, 10);
});

beforeEach(() => findUnique.mockReset());

describe("authenticateUser", () => {
  it("authenticates against the hash on the user row", async () => {
    findUnique.mockResolvedValue(userRow());

    const result = await authenticateUser("kaito@local", PASSWORD);

    expect(result).not.toBeNull();
    expect(result?.id).toBe("user-1");
    // Looked up by email alone — no `accounts` include any more.
    expect(findUnique).toHaveBeenCalledWith({ where: { email: "kaito@local" } });
  });

  it("never returns the hash, since the result becomes a JWT", async () => {
    findUnique.mockResolvedValue(userRow());

    const result = await authenticateUser("kaito@local", PASSWORD);

    expect(result).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(result)).not.toContain(passwordHash);
  });

  it("rejects a wrong password", async () => {
    findUnique.mockResolvedValue(userRow());

    expect(await authenticateUser("kaito@local", "wrong-password")).toBeNull();
  });

  it("rejects a user who has no password set", async () => {
    // An OAuth-only user, or one created before a password was chosen.
    findUnique.mockResolvedValue(userRow({ passwordHash: null }));

    expect(await authenticateUser("kaito@local", PASSWORD)).toBeNull();
  });

  it("rejects an unknown email", async () => {
    findUnique.mockResolvedValue(null);

    expect(await authenticateUser("nobody@local", PASSWORD)).toBeNull();
  });

  it("returns null rather than throwing when the lookup fails", async () => {
    findUnique.mockRejectedValue(new Error("database is down"));

    expect(await authenticateUser("kaito@local", PASSWORD)).toBeNull();
  });
});
