/**
 * The single audited egress for CalDAV. Every byte that leaves this process
 * for a CalDAV server goes through a function in this file.
 *
 * CalDAV is the only integration authenticating with a reusable account
 * password rather than a revocable token, so it is the one that most needs a
 * single place to audit what is sent and where. Before this module the same
 * Basic header was rebuilt inline in seven places, the base64 encoding was
 * done three different ways, and three separate URL joiners disagreed about
 * trailing slashes.
 *
 * Transport only. Deliberately *not* here:
 * - iCalendar (de)serialization and RRULE expansion — `caldav-calendar.ts`
 * - persistence — `caldav-calendar.ts`
 * - mapping a failure onto an HTTP status — the API routes, via
 *   `classifyCalDAVError`. The three callers want three different error
 *   policies (ctag swallows, sync rethrows, routes classify), so everything
 *   here throws and lets the caller decide.
 *
 * One operational note: tsdav logs the base64 Basic credential through the
 * `debug` package on the `tsdav:authHelper` namespace. Nothing sets `DEBUG`
 * here, and nothing should — `DEBUG=tsdav*` in production would write the
 * CalDAV password to the log.
 */

import { ConnectedAccount } from "@prisma/client";
import { DAVClient, DAVDepth, DAVResponse, createDAVClient } from "tsdav";

import { logger } from "@/lib/logger";

import {
  CalendarQueryParams,
  ExtendedDAVClient,
} from "../caldav-interfaces";

const LOG_SOURCE = "CalDAVClient";

/**
 * A CalDAV endpoint plus the credential for it. Built once per account so the
 * password is read from the record in exactly one place.
 */
export interface CalDAVConnection {
  serverUrl: string;
  username: string;
  password: string;
  /** For log correlation. Never the credential. */
  accountId: string;
}

export class CalDAVTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string
  ) {
    super(message);
    this.name = "CalDAVTransportError";
  }
}

/**
 * Builds a connection from a stored account. The `caldavUsername || email`
 * fallback lives here and only here — the API routes used to require
 * `caldavUsername` while the sync engine fell back to `email`, so the same
 * account could authenticate through one path and 400 through the other.
 */
export function connectionFromAccount(
  account: ConnectedAccount
): CalDAVConnection {
  if (!account.caldavUrl) {
    throw new Error("CalDAV URL is required");
  }

  return {
    serverUrl: account.caldavUrl,
    username: account.caldavUsername || account.email,
    password: account.accessToken,
    accountId: account.id,
  };
}

function basicAuthHeader(conn: CalDAVConnection): string {
  return (
    "Basic " +
    Buffer.from(`${conn.username}:${conn.password}`, "utf8").toString("base64")
  );
}

/** Joins an account base URL with a calendar path, or passes a full URL through. */
export function resolveCollectionUrl(
  serverUrl: string,
  calendarPathOrUrl: string
): string {
  if (calendarPathOrUrl.startsWith("http")) {
    return calendarPathOrUrl;
  }
  const base = serverUrl.replace(/\/+$/, "");
  const path = calendarPathOrUrl.startsWith("/")
    ? calendarPathOrUrl
    : `/${calendarPathOrUrl}`;
  return `${base}${path}`;
}

/** The `.ics` URL of one object inside a collection. */
export function resolveObjectUrl(collectionUrl: string, uid: string): string {
  return `${collectionUrl.replace(/\/+$/, "")}/${uid}.ics`;
}

/**
 * The tsdav client, built lazily and cached per connection.
 *
 * Construction is expensive and it is not obvious: `defaultAccountType`
 * makes `createDAVClient` perform three PROPFINDs (service discovery,
 * principal, home) before returning. It is only needed for `calendarQuery`
 * and for the write fallbacks, so nothing builds it eagerly.
 */
const clientCache = new WeakMap<CalDAVConnection, Promise<ExtendedDAVClient>>();

export function getDavClient(
  conn: CalDAVConnection
): Promise<ExtendedDAVClient> {
  const cached = clientCache.get(conn);
  if (cached) return cached;

  const pending = (async () => {
    try {
      return (await createDAVClient({
        serverUrl: conn.serverUrl,
        credentials: { username: conn.username, password: conn.password },
        authMethod: "Basic",
        defaultAccountType: "caldav",
      })) as unknown as ExtendedDAVClient;
    } catch (error) {
      logger.error(
        "Failed to create CalDAV client",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          accountId: conn.accountId,
        },
        LOG_SOURCE
      );
      throw error;
    }
  })();

  clientCache.set(conn, pending);
  return pending;
}

/**
 * The account-setup half of the surface.
 *
 * Separate from `getDavClient` on purpose: setup needs a client that has *not*
 * dialed out yet, because the discovery routes call `login()` themselves and
 * then read `client.account.principalUrl` / `.homeUrl` to decide what to try
 * next. `createDAVClient` logs in during construction and would lose that
 * seam. Signatures match the helpers these replaced, so the route files that
 * import them are untouched.
 */
export function createSetupClient(
  serverUrl: string,
  username: string,
  password: string
): DAVClient {
  return new DAVClient({
    serverUrl,
    credentials: { username, password },
    authMethod: "Basic" as const,
    defaultAccountType: "caldav" as const,
  });
}

export async function loginToServer(
  client: DAVClient,
  serverUrl: string,
  username: string
): Promise<boolean> {
  try {
    await client.login();
    logger.info(
      "Successfully logged in to CalDAV server",
      { serverUrl, username },
      LOG_SOURCE
    );
    return true;
  } catch (loginError) {
    logger.error(
      "Failed to login to CalDAV server",
      {
        error:
          loginError instanceof Error ? loginError.message : String(loginError),
        serverUrl,
        username,
      },
      LOG_SOURCE
    );
    throw loginError;
  }
}

/** PROPFIND the home collection for the account's calendars. */
export async function listCalendars(client: DAVClient) {
  try {
    return await client.fetchCalendars();
  } catch (error) {
    logger.error(
      "Failed to fetch CalDAV calendars",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    throw error;
  }
}

/** CalDAV wants `YYYYMMDDTHHMMSSZ`, not ISO-8601 with separators. */
function formatDateForCalDAV(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function buildQueryParams(
  calendarUrl: string,
  start: Date,
  end: Date,
  expand: boolean
): CalendarQueryParams {
  return {
    url: calendarUrl,
    props: {
      "calendar-data": expand
        ? {
            expand: {
              _attributes: {
                start: formatDateForCalDAV(start),
                end: formatDateForCalDAV(end),
              },
            },
          }
        : {},
    },
    filters: {
      "comp-filter": {
        _attributes: { name: "VCALENDAR" },
        "comp-filter": {
          _attributes: { name: "VEVENT" },
          "time-range": {
            _attributes: {
              start: formatDateForCalDAV(start),
              end: formatDateForCalDAV(end),
            },
          },
        },
      },
    },
    depth: "1" as DAVDepth,
  };
}

/** REPORT calendar-query over a time range. */
export async function queryEvents(
  conn: CalDAVConnection,
  params: {
    calendarUrl: string;
    start: Date;
    end: Date;
    /** Ask the server to expand recurrences itself. Master events want false. */
    expand?: boolean;
  }
): Promise<DAVResponse[]> {
  const client = await getDavClient(conn);
  return client.calendarQuery(
    buildQueryParams(
      params.calendarUrl,
      params.start,
      params.end,
      params.expand ?? false
    )
  );
}

/**
 * PROPFIND for a collection's CTag — a cheap "has anything changed here"
 * probe, so an unchanged calendar costs one request instead of a full sync.
 *
 * Throws on transport failure and returns null when the server answers
 * without a CTag (not all of them implement it). Callers that would rather
 * fall through to a full sync catch and treat both as "unknown".
 */
export async function getCalendarCtag(
  conn: CalDAVConnection,
  calendarPathOrUrl: string
): Promise<string | null> {
  const url = resolveCollectionUrl(conn.serverUrl, calendarPathOrUrl);

  const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <cs:getctag />
  </d:prop>
</d:propfind>`;

  const res = await fetch(url, {
    method: "PROPFIND",
    headers: {
      Authorization: basicAuthHeader(conn),
      Depth: "0",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
    // A cached CTag would defeat the point of asking.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new CalDAVTransportError(
      `PROPFIND getctag failed: ${res.statusText || res.status}`,
      res.status,
      res.statusText
    );
  }

  const text = await res.text();
  const patterns = [
    /<[^:]*:?getctag[^>]*>([^<]+)<\/[^:]*:?getctag>/i,
    /getctag[^>]*>([^<]+)</i,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * GET one object's iCalendar text, or null if the server declines.
 *
 * Null rather than throwing because both callers read a recurring master in
 * order to add an exception to it: if the master cannot be read there is
 * nothing to amend, and in the delete path the remote DELETE has already
 * fired, so throwing here would abort mid-operation.
 */
export async function getObjectText(
  conn: CalDAVConnection,
  url: string
): Promise<string | null> {
  const res = await fetch(url, {
    headers: { Authorization: basicAuthHeader(conn) },
  });

  if (!res.ok) {
    logger.warn(
      "CalDAV GET returned a non-OK status",
      { status: res.status, url: url.slice(0, 120), accountId: conn.accountId },
      LOG_SOURCE
    );
    return null;
  }

  return res.text();
}

interface WriteResult {
  status: number;
  statusText: string;
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * PUT an object.
 *
 * A direct `fetch` PUT first: some servers (Fastmail among them) handle it
 * where the library's own write path does not. `fallback` retries through
 * tsdav when the direct PUT is refused, and its URL is a parameter rather
 * than derived because the create path deliberately falls back to the
 * *collection* URL while update falls back to the object URL — preserved from
 * upstream, where it may well be a bug, but not one to change silently while
 * moving code.
 *
 * With no `fallback`, a non-2xx is logged and returned rather than thrown:
 * the two master-amendment callers (RECURRENCE-ID, EXDATE) have always
 * ignored the result, and changing that here would turn a cosmetic failure
 * into a user-visible error mid-refactor.
 */
export async function putObject(
  conn: CalDAVConnection,
  params: {
    url: string;
    ical: string;
    /** `If-None-Match: *` — refuse to overwrite an existing object. */
    ifNoneMatch?: boolean;
    fallback?: { mode: "create" | "update"; url: string };
    /** Label for the thrown message, e.g. "update". */
    operation?: string;
    /** Non-secret fields to attach to failure logs. */
    context?: Record<string, unknown>;
  }
): Promise<WriteResult> {
  const headers: Record<string, string> = {
    "Content-Type": "text/calendar; charset=utf-8",
    Authorization: basicAuthHeader(conn),
  };
  if (params.ifNoneMatch) {
    headers["If-None-Match"] = "*";
  }

  const response = await fetch(params.url, {
    method: "PUT",
    headers,
    body: params.ical,
  });

  if (isSuccess(response.status)) {
    return { status: response.status, statusText: response.statusText };
  }

  const operation = params.operation ?? "write";

  if (!params.fallback) {
    logger.warn(
      "CalDAV PUT returned a non-2xx status",
      {
        status: response.status,
        statusText: response.statusText,
        url: params.url.slice(0, 120),
        accountId: conn.accountId,
        ...params.context,
      },
      LOG_SOURCE
    );
    return { status: response.status, statusText: response.statusText };
  }

  logger.error(
    `Server returned error status when ${operation}ing event with PUT`,
    {
      status: response.status,
      statusText: response.statusText,
      url: params.url.slice(0, 120),
      accountId: conn.accountId,
      ...params.context,
    },
    LOG_SOURCE
  );

  const client = await getDavClient(conn);
  const fallbackHeaders: Record<string, string> = {
    "Content-Type": "text/calendar; charset=utf-8",
  };
  if (params.ifNoneMatch) {
    fallbackHeaders["If-None-Match"] = "*";
  }

  const fallbackResponse =
    params.fallback.mode === "create"
      ? await client.createObject({
          url: params.fallback.url,
          data: params.ical,
          headers: fallbackHeaders,
        })
      : await client.updateObject({
          url: params.fallback.url,
          data: params.ical,
          headers: fallbackHeaders,
        });

  if (!isSuccess(fallbackResponse.status)) {
    logger.error(
      `Server returned error status when ${operation}ing event with fallback method`,
      {
        status: fallbackResponse.status,
        statusText: fallbackResponse.statusText,
        accountId: conn.accountId,
        ...params.context,
      },
      LOG_SOURCE
    );
    throw new CalDAVTransportError(
      `Failed to ${operation} event on server: ${
        fallbackResponse.statusText || fallbackResponse.status
      }`,
      fallbackResponse.status,
      fallbackResponse.statusText ?? ""
    );
  }

  return {
    status: fallbackResponse.status,
    statusText: fallbackResponse.statusText ?? "",
  };
}

/** DELETE an object, with the same direct-then-library ladder as `putObject`. */
export async function deleteObject(
  conn: CalDAVConnection,
  params: {
    url: string;
    fallback?: { url: string };
    context?: Record<string, unknown>;
  }
): Promise<WriteResult> {
  const response = await fetch(params.url, {
    method: "DELETE",
    headers: { Authorization: basicAuthHeader(conn) },
  });

  if (isSuccess(response.status)) {
    return { status: response.status, statusText: response.statusText };
  }

  logger.error(
    "Server returned error status when deleting event with DELETE",
    {
      status: response.status,
      statusText: response.statusText,
      url: params.url.slice(0, 120),
      accountId: conn.accountId,
      ...params.context,
    },
    LOG_SOURCE
  );

  if (!params.fallback) {
    throw new CalDAVTransportError(
      `Failed to delete event on server: ${
        response.statusText || response.status
      }`,
      response.status,
      response.statusText
    );
  }

  const client = await getDavClient(conn);
  const fallbackResponse = await client.deleteObject({
    url: params.fallback.url,
  });

  if (!isSuccess(fallbackResponse.status)) {
    logger.error(
      "Server returned error status when deleting event with fallback method",
      {
        status: fallbackResponse.status,
        statusText: fallbackResponse.statusText,
        accountId: conn.accountId,
        ...params.context,
      },
      LOG_SOURCE
    );
    throw new CalDAVTransportError(
      `Failed to delete event on server: ${
        fallbackResponse.statusText || fallbackResponse.status
      }`,
      fallbackResponse.status,
      fallbackResponse.statusText ?? ""
    );
  }

  return {
    status: fallbackResponse.status,
    statusText: fallbackResponse.statusText ?? "",
  };
}
