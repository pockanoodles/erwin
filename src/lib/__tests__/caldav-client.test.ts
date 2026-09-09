import { ConnectedAccount } from "@prisma/client";

import {
  CalDAVTransportError,
  connectionFromAccount,
  deleteObject,
  getCalendarCtag,
  getObjectText,
  putObject,
  resolveCollectionUrl,
  resolveObjectUrl,
} from "@/lib/caldav/client";
import { logger } from "@/lib/logger";

/**
 * Contract tests for the single audited CalDAV egress.
 *
 * CalDAV authenticates with a reusable account password rather than a
 * revocable token, so what this module puts on the wire — and what it keeps
 * out of the logs — is worth pinning down. Before consolidation there was no
 * seam to test: the Basic header was rebuilt inline at seven call sites.
 */

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const PASSWORD = "s3cret-caldav-pass";

const account = {
  id: "acct-1",
  email: "fallback@example.com",
  caldavUsername: "dav-user",
  accessToken: PASSWORD,
  caldavUrl: "https://dav.example.com/",
} as unknown as ConnectedAccount;

type FetchCall = { url: string; init: RequestInit };

let calls: FetchCall[];

function mockFetch(responder: (call: FetchCall) => unknown) {
  const fetchMock = jest.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return responder({ url, init });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
}

function ok(body = "", status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    text: async () => body,
  } as unknown as Response;
}

function headerOf(call: FetchCall, name: string): string | undefined {
  return (call.init.headers as Record<string, string> | undefined)?.[name];
}

beforeEach(() => {
  calls = [];
  jest.clearAllMocks();
});

describe("connectionFromAccount", () => {
  it("prefers caldavUsername over email", () => {
    expect(connectionFromAccount(account).username).toBe("dav-user");
  });

  it("falls back to email when no CalDAV username is stored", () => {
    // The routes used to require caldavUsername while the sync engine fell
    // back to email, so one account could work through one path and 400
    // through the other. One rule now.
    const withoutUsername = {
      ...account,
      caldavUsername: null,
    } as unknown as ConnectedAccount;

    expect(connectionFromAccount(withoutUsername).username).toBe(
      "fallback@example.com"
    );
  });

  it("refuses an account with no CalDAV URL", () => {
    const withoutUrl = { ...account, caldavUrl: null } as ConnectedAccount;

    expect(() => connectionFromAccount(withoutUrl)).toThrow(
      "CalDAV URL is required"
    );
  });
});

describe("URL resolution", () => {
  const conn = connectionFromAccount(account);

  it("joins a relative calendar path onto the account base", () => {
    expect(resolveCollectionUrl(conn.serverUrl, "calendars/user/home")).toBe(
      "https://dav.example.com/calendars/user/home"
    );
  });

  it("does not double up separators", () => {
    // The base ends in a slash and the path starts with one.
    expect(resolveCollectionUrl(conn.serverUrl, "/calendars/home")).toBe(
      "https://dav.example.com/calendars/home"
    );
  });

  it("passes an absolute URL through untouched", () => {
    expect(
      resolveCollectionUrl(conn.serverUrl, "https://other.example.com/cal")
    ).toBe("https://other.example.com/cal");
  });

  it("builds an object URL regardless of a trailing slash", () => {
    expect(resolveObjectUrl("https://d.example.com/cal", "uid-1")).toBe(
      "https://d.example.com/cal/uid-1.ics"
    );
    expect(resolveObjectUrl("https://d.example.com/cal/", "uid-1")).toBe(
      "https://d.example.com/cal/uid-1.ics"
    );
  });
});

describe("authentication", () => {
  const conn = connectionFromAccount(account);

  it("sends the credential as a Basic header, base64 of user:pass", async () => {
    mockFetch(() => ok(""));

    await getObjectText(conn, "https://dav.example.com/cal/uid-1.ics");

    const expected =
      "Basic " + Buffer.from(`dav-user:${PASSWORD}`, "utf8").toString("base64");
    expect(headerOf(calls[0], "Authorization")).toBe(expected);
  });

  it("never puts the password in a URL or a log", async () => {
    mockFetch(() => ok("", 500));

    await putObject(conn, {
      url: "https://dav.example.com/cal/uid-1.ics",
      ical: "BEGIN:VCALENDAR",
    });

    // No fallback configured, so this logs a warning and returns.
    const logged = JSON.stringify([
      (logger.warn as jest.Mock).mock.calls,
      (logger.error as jest.Mock).mock.calls,
    ]);
    expect(logged).not.toContain(PASSWORD);
    expect(calls[0].url).not.toContain(PASSWORD);
  });
});

describe("getCalendarCtag", () => {
  const conn = connectionFromAccount(account);

  it("PROPFINDs at depth 0 and returns the ctag", async () => {
    mockFetch(() =>
      ok(
        `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"><d:response><d:propstat><d:prop><cs:getctag>"abc-123"</cs:getctag></d:prop></d:propstat></d:response></d:multistatus>`
      )
    );

    const ctag = await getCalendarCtag(conn, "/calendars/home");

    expect(ctag).toBe('"abc-123"');
    expect(calls[0].init.method).toBe("PROPFIND");
    expect(headerOf(calls[0], "Depth")).toBe("0");
    // A cached ctag would defeat the purpose of asking.
    expect(calls[0].init.cache).toBe("no-store");
  });

  it("returns null when the server answers without a ctag", async () => {
    mockFetch(() => ok("<d:multistatus xmlns:d=\"DAV:\"></d:multistatus>"));

    expect(await getCalendarCtag(conn, "/calendars/home")).toBeNull();
  });

  it("throws on a transport failure, leaving the policy to the caller", async () => {
    mockFetch(() => ok("", 401));

    await expect(getCalendarCtag(conn, "/calendars/home")).rejects.toThrow(
      CalDAVTransportError
    );
  });
});

describe("putObject", () => {
  const conn = connectionFromAccount(account);

  it("PUTs the iCalendar body with the calendar content type", async () => {
    mockFetch(() => ok());

    await putObject(conn, {
      url: "https://dav.example.com/cal/uid-1.ics",
      ical: "BEGIN:VCALENDAR",
    });

    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].init.body).toBe("BEGIN:VCALENDAR");
    expect(headerOf(calls[0], "Content-Type")).toBe(
      "text/calendar; charset=utf-8"
    );
  });

  it("only sends If-None-Match when creating", async () => {
    mockFetch(() => ok());

    await putObject(conn, {
      url: "https://dav.example.com/cal/uid-1.ics",
      ical: "BEGIN:VCALENDAR",
    });
    expect(headerOf(calls[0], "If-None-Match")).toBeUndefined();

    await putObject(conn, {
      url: "https://dav.example.com/cal/uid-2.ics",
      ical: "BEGIN:VCALENDAR",
      ifNoneMatch: true,
    });
    expect(headerOf(calls[1], "If-None-Match")).toBe("*");
  });

  it("does not throw without a fallback, since master amendments ignore the result", async () => {
    mockFetch(() => ok("", 412));

    const result = await putObject(conn, {
      url: "https://dav.example.com/cal/uid-1.ics",
      ical: "BEGIN:VCALENDAR",
    });

    expect(result.status).toBe(412);
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe("deleteObject", () => {
  const conn = connectionFromAccount(account);

  it("issues a DELETE and succeeds on 2xx without building a tsdav client", async () => {
    mockFetch(() => ok());

    const result = await deleteObject(conn, {
      url: "https://dav.example.com/cal/uid-1.ics",
    });

    expect(result.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("DELETE");
  });

  it("throws a transport error when refused and no fallback is configured", async () => {
    mockFetch(() => ok("", 403));

    await expect(
      deleteObject(conn, { url: "https://dav.example.com/cal/uid-1.ics" })
    ).rejects.toThrow(/Failed to delete event on server/);
  });
});

describe("getObjectText", () => {
  const conn = connectionFromAccount(account);

  it("returns the body on success", async () => {
    mockFetch(() => ok("BEGIN:VCALENDAR\r\nEND:VCALENDAR"));

    expect(await getObjectText(conn, "https://dav.example.com/x.ics")).toBe(
      "BEGIN:VCALENDAR\r\nEND:VCALENDAR"
    );
  });

  it("returns null rather than throwing when the object cannot be read", async () => {
    // The delete path calls this *after* the remote DELETE has fired, so
    // throwing here would abort a half-finished operation.
    mockFetch(() => ok("", 404));

    expect(
      await getObjectText(conn, "https://dav.example.com/x.ics")
    ).toBeNull();
  });
});
