import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";

import { OAUTH_REQUEST_TTL_MS, claimOAuth, newCodeVerifier, startOAuth } from "../requests";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthRequest: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

const rows = prisma.oAuthRequest as unknown as {
  create: jest.Mock;
  deleteMany: jest.Mock;
  findUnique: jest.Mock;
};

const pending = {
  provider: "GOOGLE" as const,
  app: "sigwald" as const,
  codeVerifier: newCodeVerifier(),
  redirectUri: "http://127.0.0.1:41739/api/calendar/google",
  userId: "user-1",
};

describe("OAuth requests", () => {
  beforeEach(() => jest.resetAllMocks());

  it("stores the verifier and sends only its S256 hash", async () => {
    rows.deleteMany.mockResolvedValue({ count: 0 });
    const { state, codeChallenge } = await startOAuth(pending);
    const expected = crypto.createHash("sha256").update(pending.codeVerifier).digest("base64url");
    expect(codeChallenge).toBe(expected);
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rows.create).toHaveBeenCalledWith({ data: { state, ...pending } });
  });

  it("hands a sign-in to its callback once", async () => {
    rows.findUnique.mockResolvedValue({ state: "s", ...pending, createdAt: new Date() });
    rows.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await claimOAuth("s", "GOOGLE")).toEqual(pending);
    expect(await claimOAuth("s", "GOOGLE")).toBeNull();
  });

  it("refuses a missing state, another provider's sign-in, and a stale one", async () => {
    expect(await claimOAuth(null, "GOOGLE")).toBeNull();
    rows.deleteMany.mockResolvedValue({ count: 1 });
    rows.findUnique.mockResolvedValue({ state: "s", ...pending, createdAt: new Date() });
    expect(await claimOAuth("s", "OUTLOOK")).toBeNull();
    rows.findUnique.mockResolvedValue({
      state: "s",
      ...pending,
      createdAt: new Date(Date.now() - OAUTH_REQUEST_TTL_MS - 1000),
    });
    expect(await claimOAuth("s", "GOOGLE")).toBeNull();
  });
});
