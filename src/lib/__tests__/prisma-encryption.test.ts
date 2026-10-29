import {
  decryptResultForModel,
  encryptArgsForModel,
} from "@/lib/crypto/prisma-encryption";
import { isEncrypted, resetKeyCache } from "@/lib/crypto/secret-box";

/**
 * The transparent layer has to work at depth, not just on the model named in
 * the query.
 *
 * The regression these pin down: credentials are almost always read through a
 * relation — `calendarFeed.findUnique({ include: { account: true } })` and
 * fourteen more like it — and a version of this extension that keyed only off
 * the operation's model handed those back as ciphertext. The value was then
 * sent to the provider as the password, which failed as a 401 that the sync
 * path swallowed, after it had already deleted the feed's events.
 */

const KEY = Buffer.alloc(32, 5).toString("base64");

beforeAll(() => {
  process.env.SIGWALD_SECRET_KEY = KEY;
  resetKeyCache();
});

afterAll(() => {
  delete process.env.SIGWALD_SECRET_KEY;
  resetKeyCache();
});

/** Encrypt a value the way a write would have stored it. */
function stored(value: string): string {
  const args = encryptArgsForModel("ConnectedAccount", {
    accessToken: value,
  }) as { accessToken: string };
  return args.accessToken;
}

describe("reads", () => {
  it("decrypts a credential on its own model", () => {
    const row = { id: "a1", accessToken: stored("tok-direct") };

    const result = decryptResultForModel("ConnectedAccount", row) as {
      accessToken: string;
    };

    expect(result.accessToken).toBe("tok-direct");
  });

  it("decrypts a credential reached through an include", () => {
    const feed = {
      id: "feed-1",
      type: "CALDAV",
      account: { id: "a1", accessToken: stored("tok-nested") },
    };

    const result = decryptResultForModel("CalendarFeed", feed) as {
      account: { accessToken: string };
    };

    expect(result.account.accessToken).toBe("tok-nested");
  });

  it("decrypts credentials inside an included list", () => {
    const user = {
      id: "u1",
      connectedAccounts: [
        { id: "a1", accessToken: stored("tok-1") },
        { id: "a2", accessToken: stored("tok-2") },
      ],
    };

    const result = decryptResultForModel("User", user) as {
      connectedAccounts: { accessToken: string }[];
    };

    expect(result.connectedAccounts.map((a) => a.accessToken)).toEqual([
      "tok-1",
      "tok-2",
    ]);
  });

  it("decrypts through two hops of relations", () => {
    const event = {
      id: "e1",
      feed: {
        id: "feed-1",
        account: { id: "a1", accessToken: stored("tok-deep") },
      },
    };

    const result = decryptResultForModel("CalendarEvent", event) as {
      feed: { account: { accessToken: string } };
    };

    expect(result.feed.account.accessToken).toBe("tok-deep");
  });

  it("leaves non-credential fields and unrelated models alone", () => {
    const task = { id: "t1", title: "Write the thing", description: null };

    expect(decryptResultForModel("Task", task)).toBe(task);
  });

  it("passes through a null result and a bulk-write count", () => {
    expect(decryptResultForModel("ConnectedAccount", null)).toBeNull();
    const count = { count: 3 };
    expect(decryptResultForModel("ConnectedAccount", count)).toBe(count);
  });
});

describe("writes", () => {
  it("encrypts a credential on its own model", () => {
    const args = encryptArgsForModel("ConnectedAccount", {
      accessToken: "plain-token",
    }) as { accessToken: string };

    expect(isEncrypted(args.accessToken)).toBe(true);
    expect(args.accessToken).not.toContain("plain-token");
  });

  it("encrypts a credential written through a nested create", () => {
    const args = encryptArgsForModel("CalendarFeed", {
      name: "Family",
      account: { create: { accessToken: "nested-token" } },
    }) as { account: { create: { accessToken: string } } };

    expect(isEncrypted(args.account.create.accessToken)).toBe(true);
  });

  it("encrypts through a nested update wrapped in `data`", () => {
    const args = encryptArgsForModel("CalendarFeed", {
      account: { update: { data: { accessToken: "rotated" } } },
    }) as { account: { update: { data: { accessToken: string } } } };

    expect(isEncrypted(args.account.update.data.accessToken)).toBe(true);
  });

  it("encrypts both halves of a nested upsert", () => {
    const args = encryptArgsForModel("CalendarFeed", {
      account: {
        upsert: {
          create: { accessToken: "created" },
          update: { accessToken: "updated" },
        },
      },
    }) as {
      account: { upsert: { create: { accessToken: string }; update: { accessToken: string } } };
    };

    expect(isEncrypted(args.account.upsert.create.accessToken)).toBe(true);
    expect(isEncrypted(args.account.upsert.update.accessToken)).toBe(true);
  });

  it("handles the `{ set: value }` update form", () => {
    const args = encryptArgsForModel("ConnectedAccount", {
      accessToken: { set: "via-set" },
    }) as { accessToken: { set: string } };

    expect(isEncrypted(args.accessToken.set)).toBe(true);
  });

  it("leaves relation keys that only reference existing rows alone", () => {
    // `connect` carries an id, not a credential.
    const args = { account: { connect: { id: "a1" } } };

    expect(encryptArgsForModel("CalendarFeed", args)).toBe(args);
  });

  it("round-trips: what a write stores, a nested read returns", () => {
    const written = encryptArgsForModel("CalendarFeed", {
      account: { create: { accessToken: "round-trip" } },
    }) as { account: { create: { accessToken: string } } };

    const readBack = decryptResultForModel("CalendarFeed", {
      account: { accessToken: written.account.create.accessToken },
    }) as { account: { accessToken: string } };

    expect(readBack.account.accessToken).toBe("round-trip");
  });
});
