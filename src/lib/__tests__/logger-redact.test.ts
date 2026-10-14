import {
  REDACTED,
  redactMetadata,
  redactString,
} from "@/lib/logger/redact";

/**
 * The `Log` table is not encrypted and the server logger also prints each
 * entry to stdout, which launchd captures to a file. These pin down that a
 * credential handed to the logger cannot reach either one.
 *
 * The case that motivated it: a route logged `JSON.stringify(feed)` where the
 * feed was loaded with `include: { account: true }`, which would have written
 * a live CalDAV password to both. Note that the key-based half does not catch
 * that one — by then the credential is inside a string — which is why the
 * pattern-based half exists.
 */

describe("redaction by key", () => {
  it("removes credential fields at the top level", () => {
    const result = redactMetadata({
      accessToken: "ya29.super-secret",
      refreshToken: "1//refresh-secret",
      userId: "u1",
    });

    expect(result).toEqual({
      accessToken: REDACTED,
      refreshToken: REDACTED,
      userId: "u1",
    });
  });

  it("matches regardless of casing or separators", () => {
    const result = redactMetadata({
      access_token: "a",
      "Refresh-Token": "b",
      PASSWORD: "c",
    });

    expect(Object.values(result)).toEqual([REDACTED, REDACTED, REDACTED]);
  });

  it("matches by suffix, so a prefixed key is still caught", () => {
    const result = redactMetadata({
      googleClientSecret: "gcs",
      stripeApiKey: "rk",
      caldavPassword: "pw",
    });

    expect(Object.values(result)).toEqual([REDACTED, REDACTED, REDACTED]);
  });

  it("reaches credentials nested in objects and arrays", () => {
    const result = redactMetadata({
      feed: { name: "Family", account: { accessToken: "secret" } },
      accounts: [{ accessToken: "one" }, { accessToken: "two" }],
    }) as {
      feed: { name: string; account: { accessToken: string } };
      accounts: { accessToken: string }[];
    };

    expect(result.feed.account.accessToken).toBe(REDACTED);
    expect(result.feed.name).toBe("Family");
    expect(result.accounts.map((a) => a.accessToken)).toEqual([
      REDACTED,
      REDACTED,
    ]);
  });

  it("leaves sync cursors alone, since blanking them would hurt debugging", () => {
    const metadata = { syncToken: "abc", ctag: "HwoQ", feedId: "f1" };

    expect(redactMetadata(metadata)).toEqual(metadata);
  });

  it("does not mutate the caller's object", () => {
    const original = { accessToken: "keep-me-in-memory" };
    redactMetadata(original);

    expect(original.accessToken).toBe("keep-me-in-memory");
  });

  it("survives a cyclic structure", () => {
    const node: Record<string, unknown> = { name: "a" };
    node.self = node;

    expect(() => redactMetadata(node)).not.toThrow();
  });
});

describe("redaction by pattern inside strings", () => {
  it("removes an Authorization header value but keeps the scheme", () => {
    const header = "Basic ZGF2LXVzZXI6c3VwZXItc2VjcmV0";

    expect(redactString(header)).toBe(`Basic ${REDACTED}`);
    expect(redactString("Bearer ya29.abcdefghijkl")).toBe(
      `Bearer ${REDACTED}`
    );
  });

  it("catches a credential inside an already-serialized record", () => {
    // Exactly the shape of the JSON.stringify(feed) leak.
    const serialized = JSON.stringify({
      id: "feed-1",
      type: "CALDAV",
      account: { accessToken: "the-caldav-password", email: "k@example.com" },
    });

    const result = redactString(serialized);

    expect(result).not.toContain("the-caldav-password");
    expect(result).toContain("CALDAV");
    expect(result).toContain("k@example.com");
  });

  it("catches a serialized credential nested in metadata", () => {
    const result = redactMetadata({
      feed: JSON.stringify({ accessToken: "leaked-here" }),
    }) as { feed: string };

    expect(result.feed).not.toContain("leaked-here");
  });

  it("removes a password embedded in a URL but keeps the host", () => {
    const result = redactString(
      "connecting to https://dav-user:hunter2@dav.example.com/calendars"
    );

    expect(result).not.toContain("hunter2");
    expect(result).toContain("dav.example.com/calendars");
    expect(result).toContain("dav-user");
  });

  it("leaves an ordinary message untouched", () => {
    const message = "Synced 83 events for feed Family in 412ms";

    expect(redactString(message)).toBe(message);
  });
});
