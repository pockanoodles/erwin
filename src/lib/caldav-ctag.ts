/**
 * Lightweight PROPFIND for calendar collection CTag (skip full sync when unchanged).
 */

import { logger } from "@/lib/logger";

const LOG_SOURCE = "CalDAVCTag";

function resolveCalendarUrl(accountBaseUrl: string, calendarPathOrUrl: string): string {
  if (calendarPathOrUrl.startsWith("http")) {
    return calendarPathOrUrl;
  }
  const base = accountBaseUrl.replace(/\/+$/, "");
  const path = calendarPathOrUrl.startsWith("/") ? calendarPathOrUrl : `/${calendarPathOrUrl}`;
  return `${base}${path}`;
}

/**
 * Returns the server's calendar CTag, or null if unavailable.
 */
export async function fetchCalendarCtag(params: {
  accountBaseUrl: string;
  calendarPathOrUrl: string;
  username: string;
  password: string;
}): Promise<string | null> {
  const { username, password } = params;
  const url = resolveCalendarUrl(params.accountBaseUrl, params.calendarPathOrUrl);

  const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <cs:getctag />
  </d:prop>
</d:propfind>`;

  try {
    const auth = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
    const res = await fetch(url, {
      method: "PROPFIND",
      headers: {
        Authorization: `Basic ${auth}`,
        Depth: "0",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body,
      cache: "no-store",
    });

    if (!res.ok) {
      logger.warn(
        "PROPFIND getctag failed",
        { status: res.status, url: url.slice(0, 80) },
        LOG_SOURCE
      );
      return null;
    }

    const text = await res.text();
    const patterns = [
      /<[^:]*:?getctag[^>]*>([^<]+)<\/[^:]*:?getctag>/i,
      /getctag[^>]*>([^<]+)</i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.[1]) {
        return m[1].trim();
      }
    }

    return null;
  } catch (error) {
    logger.warn(
      "fetchCalendarCtag error",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return null;
  }
}
