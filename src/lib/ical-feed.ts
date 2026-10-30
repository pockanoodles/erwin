import { CalendarEvent } from "@prisma/client";
import ICAL from "ical.js";

import { convertVEventToCalendarEvent } from "./caldav-helpers";
import { newDate } from "./date-utils";
import { seriesOccurrences } from "./ical-recurrence";
import { logger } from "./logger";
import { assertPublicHost, assertResolvesPublic } from "./net/public-host";
import { prisma } from "./prisma";

const LOG_SOURCE = "ICalFeed";

// Cap the ICS body we read from an arbitrary user-supplied URL to avoid pulling
// an unbounded response into memory (mild SSRF/abuse hardening).
const MAX_ICS_BYTES = 10 * 1024 * 1024; // 10 MB

// Abort a slow/hung fetch so it can't tie up a worker indefinitely.
const FETCH_TIMEOUT_MS = 15_000;

// Safety cap on materialized occurrences per recurring master. ICS feeds are
// static documents synced as a unit, so callers expand into a bounded window
// (like the Google provider stores instances) rather than relying on the render
// path, which only expands masters when explicitly asked.
const MAX_EXPANDED_INSTANCES = 1000;

// Time all of a feed's series may take to expand. Each one is bounded on its
// own (src/lib/ical-recurrence.ts), but a 10 MB feed can hold thousands; past
// this, the rest keep their masters only.
const MAX_FEED_EXPANSION_MS = 5_000;

// Feed-level cap on TOTAL materialized rows (masters + one-offs + every
// expanded instance). The per-master cap alone is not enough: a single (byte-
// capped) feed can carry many recurring masters, so without a global ceiling a
// sync could still expand to `masters * 1000` rows and exhaust memory / DB
// transaction time. Expansion stops once this is reached.
const MAX_TOTAL_EXPANDED_EVENTS = 50_000;

/**
 * Fields of a parsed iCal event that are safe to persist for a new feed event.
 *
 * The placeholder `id`/`feedId`/timestamps produced by
 * `convertVEventToCalendarEvent` are dropped so the database assigns them (and
 * `feedId` is set by the caller). The JSON columns `organizer`/`attendees` are
 * also dropped: the converter always emits them as `null`, and keeping them as
 * Prisma `JsonValue` (which includes `null`) is incompatible with `createMany`'s
 * `NullableJsonNullValueInput` typing. iCal subscriptions do not surface
 * organizer/attendee data today, so omitting them is lossless.
 */
export type ParsedIcalEvent = Omit<
  CalendarEvent,
  "id" | "feedId" | "createdAt" | "updatedAt" | "organizer" | "attendees"
> & {
  /**
   * Internal, non-persisted: epoch-millis of occurrences cancelled via EXDATE
   * on a recurring master. Consumed (and stripped) by {@link expandIcalEvents}
   * so cancelled instances are not materialized. Never written to the DB.
   */
  exdates?: number[];
  /**
   * Internal, non-persisted: on an override (a VEVENT with RECURRENCE-ID), the
   * epoch-millis of the occurrence it replaces. {@link expandIcalEvents} skips
   * that occurrence of the series, so a moved class shows once, at its new time.
   */
  recurrenceId?: number;
  /**
   * Internal, non-persisted: a series' own VEVENT, which
   * {@link expandIcalEvents} expands in the time zone of its DTSTART and with
   * its EXDATEs and RDATEs (src/lib/ical-recurrence.ts), so a weekly 9:00
   * class stays at 9:00 across a daylight-saving change.
   */
  source?: ICAL.Component;
};

/**
 * Normalizes a user-supplied iCal subscription URL.
 *
 * - Trims surrounding whitespace.
 * - Rewrites `webcal://` / `webcals://` to `https://` (the de-facto convention
 *   for subscribe links).
 * - Accepts only `http`/`https` after normalization; anything else throws.
 *
 * @param url Raw URL entered by the user
 * @returns A fetchable `http(s)` URL
 */
export function normalizeIcalUrl(url: string): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) {
    throw new Error("iCal URL is required");
  }

  let normalized = trimmed;
  if (/^webcals:\/\//i.test(normalized)) {
    normalized = normalized.replace(/^webcals:\/\//i, "https://");
  } else if (/^webcal:\/\//i.test(normalized)) {
    normalized = normalized.replace(/^webcal:\/\//i, "https://");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Invalid iCal URL: ${trimmed}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Unsupported iCal URL scheme: ${parsed.protocol} (only http/https/webcal are allowed)`
    );
  }

  return normalized;
}

/**
 * Parses an iCal/ICS document into calendar events.
 *
 * Reuses the CalDAV `convertVEventToCalendarEvent` helper so recurrence,
 * all-day detection, and duration handling match the rest of the app. Recurring
 * masters keep their `recurrenceRule`/`isMaster` so the store's render-time
 * expansion (`getExpandedEvents`) produces their occurrences.
 *
 * @param icsText Raw ICS document text
 * @returns Parsed events ready to be persisted (without `id`/`feedId`)
 * @throws If the body cannot be parsed as an iCalendar document
 */
export function parseIcalEvents(icsText: string): ParsedIcalEvent[] {
  const jcalData = ICAL.parse(icsText);
  const vcalendar = new ICAL.Component(jcalData);
  const vevents = vcalendar.getAllSubcomponents("vevent");

  const parsed: ParsedIcalEvent[] = [];
  for (const vevent of vevents) {
    const event = convertVEventToCalendarEvent(vevent);
    // The converter answers a VEVENT it can't read with a placeholder titled
    // "Error parsing event" at the current time, and only that placeholder
    // lacks an externalEventId. Skip it rather than show it on the calendar.
    if (event.externalEventId == null) continue;
    const exdates = extractExdates(vevent);
    const recurrenceId = extractRecurrenceId(vevent);
    // Strip placeholder/DB-managed fields so the persistence layer assigns
    // them and the caller's feedId wins.
    const {
      id: _id,
      feedId: _feedId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      organizer: _organizer,
      attendees: _attendees,
      ...rest
    } = event;
    void _id;
    void _feedId;
    void _createdAt;
    void _updatedAt;
    void _organizer;
    void _attendees;
    // ICS subscriptions are flat documents synced as a unit: recurring masters
    // are expanded at render time (store.getExpandedEvents). We deliberately do
    // NOT persist DB-level instance linkage, because `masterEventId` is a
    // self-referencing foreign key and a RECURRENCE-ID's derived id would point
    // at a row that does not exist in this feed, causing an FK violation on
    // insert. Null them so every parsed event is a standalone/master row.
    parsed.push({
      ...rest,
      masterEventId: null,
      recurringEventId: null,
      ...(exdates.length > 0 ? { exdates } : {}),
      ...(recurrenceId != null ? { recurrenceId } : {}),
      ...(rest.isMaster && rest.recurrenceRule ? { source: vevent } : {}),
    });
  }
  return parsed;
}

/** The RECURRENCE-ID of an override as epoch-millis, or null when it has none. */
function extractRecurrenceId(vevent: ICAL.Component): number | null {
  const value = vevent.getFirstPropertyValue("recurrence-id");
  if (!value || typeof (value as ICAL.Time).toJSDate !== "function") return null;
  const ms = (value as ICAL.Time).toJSDate().getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Collects EXDATE timestamps (epoch-millis) from a VEVENT. Handles multiple
 * EXDATE lines and comma-separated values within a line. Returns an empty array
 * when the event has none or extraction fails.
 */
function extractExdates(vevent: ICAL.Component): number[] {
  try {
    const props = vevent.getAllProperties("exdate");
    const times: number[] = [];
    for (const prop of props) {
      for (const value of prop.getValues()) {
        // EXDATE values parse as ICAL.Time; convert to a JS Date epoch.
        const date =
          value && typeof (value as ICAL.Time).toJSDate === "function"
            ? (value as ICAL.Time).toJSDate()
            : new Date(String(value));
        const ms = date.getTime();
        if (!Number.isNaN(ms)) times.push(ms);
      }
    }
    return times;
  } catch {
    // EXDATE is best-effort: if parsing fails we fall back to expanding the
    // full rule rather than dropping the event.
    return [];
  }
}

/**
 * Drops the internal, non-persisted `exdates`, `recurrenceId` and `source`
 * fields so the row is safe to write to the database (Prisma `createMany`
 * rejects unknown columns).
 */
function stripInternal(event: ParsedIcalEvent): ParsedIcalEvent {
  if (!("exdates" in event) && !("recurrenceId" in event) && !("source" in event)) {
    return event;
  }
  const {
    exdates: _exdates,
    recurrenceId: _recurrenceId,
    source: _source,
    ...rest
  } = event;
  void _exdates;
  void _recurrenceId;
  void _source;
  return rest;
}

const isCancelled = (event: ParsedIcalEvent) => event.status === "CANCELLED";

/**
 * Materializes recurring masters into concrete occurrence rows within a window.
 *
 * The calendar render path (`getAllCalendarItems` -> `getExpandedEvents`) does
 * NOT expand masters (it only emits stored instances), so a master alone would
 * be invisible. Mirroring the Google provider, we persist a master row (kept
 * for metadata, skipped at render because `isMaster` is true) plus standalone
 * instance rows that actually render. Instances carry no `masterEventId` to
 * avoid a self-FK violation on a single-pass `createMany`.
 *
 * Rows are bounded per master (`MAX_EXPANDED_INSTANCES`) and across the whole
 * feed (`MAX_TOTAL_EXPANDED_EVENTS`), so a single byte-capped ICS with many
 * recurring masters cannot expand into an unbounded database write. The work
 * is bounded too: per series in ical-recurrence.ts, and per feed by
 * `MAX_FEED_EXPANSION_MS`. Series expand in their own time zone, and
 * cancelled events, cancelled overrides included, are left out.
 *
 * @param events Parsed events (from `parseIcalEvents`)
 * @param windowStart Earliest occurrence to materialize
 * @param windowEnd Latest occurrence to materialize
 * @returns Events ready to persist (masters + materialized instances + one-offs)
 */
export function expandIcalEvents(
  events: ParsedIcalEvent[],
  windowStart: Date,
  windowEnd: Date
): ParsedIcalEvent[] {
  const result: ParsedIcalEvent[] = [];
  let capped = false;
  const deadline = Date.now() + MAX_FEED_EXPANSION_MS;
  let outOfTime = false;

  // Occurrences replaced by an override, per series UID. A cancelled override
  // counts too: its occurrence goes, and nothing takes its place.
  const overridden = new Map<string, Set<number>>();
  for (const event of events) {
    if (event.recurrenceId == null || !event.externalEventId) continue;
    const times = overridden.get(event.externalEventId) ?? new Set<number>();
    times.add(event.recurrenceId);
    overridden.set(event.externalEventId, times);
  }

  for (const event of events) {
    if (result.length >= MAX_TOTAL_EXPANDED_EVENTS) {
      capped = true;
      break;
    }

    // Cancelled events stay off the calendar: a read-only feed gives no other
    // way to remove them.
    if (isCancelled(event)) continue;

    if (event.recurrenceId != null) {
      // An override shares its series' UID, and its start can equal the
      // series' first start, which the (feed, externalEventId, start) unique
      // index forbids. It takes the id of the occurrence it replaces, which
      // the series skips below, so the id stays unique and stable across syncs.
      result.push({
        ...stripInternal(event),
        externalEventId: event.externalEventId
          ? `${event.externalEventId}_${new Date(event.recurrenceId).toISOString()}`
          : null,
        isMaster: false,
        isRecurring: false,
        recurrenceRule: null,
      });
      continue;
    }

    if (!event.isMaster || !event.recurrenceRule) {
      // `exdates` is an internal parse artifact; never persist it.
      result.push(stripInternal(event));
      continue;
    }

    // Keep the master row (preserves recurrence metadata; not rendered).
    result.push(stripInternal(event));
    if (!event.source) continue;
    if (Date.now() > deadline) {
      outOfTime = true;
      continue;
    }

    try {
      const start = newDate(event.start);
      const end = newDate(event.end);
      const duration = end.getTime() - start.getTime();

      // ical.js drops EXDATEs itself; occurrences an override replaces (or
      // cancels) are dropped here.
      const excluded = new Set([
        ...(event.exdates ?? []),
        ...(overridden.get(event.externalEventId ?? "") ?? []),
      ]);

      const occurrences = seriesOccurrences(
        event.source,
        windowStart,
        windowEnd,
        MAX_EXPANDED_INSTANCES
      );
      if (!occurrences) {
        logger.warn(
          "iCal series repeats more often than every hour; kept its master only",
          { recurrenceRule: event.recurrenceRule },
          LOG_SOURCE
        );
        continue;
      }

      for (const instanceStart of occurrences) {
        if (result.length >= MAX_TOTAL_EXPANDED_EVENTS) {
          capped = true;
          break;
        }
        if (excluded.has(instanceStart.getTime())) continue;
        result.push({
          ...stripInternal(event),
          externalEventId: event.externalEventId
            ? `${event.externalEventId}_${instanceStart.toISOString()}`
            : null,
          start: instanceStart,
          end: newDate(instanceStart.getTime() + duration),
          isMaster: false,
          isRecurring: false,
          recurrenceRule: null,
          masterEventId: null,
          recurringEventId: null,
        });
      }
    } catch (error) {
      // Unparseable rule: the master row we already pushed is the fallback so
      // the event isn't silently dropped.
      logger.warn(
        "Failed to expand iCal recurrence rule",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          recurrenceRule: event.recurrenceRule,
        },
        LOG_SOURCE
      );
    }
  }

  if (outOfTime) {
    logger.warn(
      "iCal feed took too long to expand; later series kept their masters only",
      { limitMs: MAX_FEED_EXPANSION_MS },
      LOG_SOURCE
    );
  }

  if (capped) {
    logger.warn(
      "iCal feed expansion hit the total event cap; truncating",
      { cap: MAX_TOTAL_EXPANDED_EVENTS, kept: result.length },
      LOG_SOURCE
    );
  }

  return result;
}

/**
 * Fetches an iCal URL and parses it into calendar events.
 *
 * The URL is normalized first, then fetched server-side (to avoid browser CORS
 * with arbitrary hosts). A non-success HTTP status or an unparseable body
 * throws, so callers can surface a sync error without destroying previously
 * synced events.
 *
 * @param url Raw user-supplied URL
 * @param fetchImpl Injectable fetch (defaults to global fetch); used by tests
 * @returns Parsed events ready to be persisted
 */
export async function fetchIcalEvents(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<ParsedIcalEvent[]> {
  const body = await fetchIcalBody(url, fetchImpl);

  try {
    return parseIcalEvents(body);
  } catch (error) {
    logger.error(
      "Failed to parse iCal feed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    throw new Error(
      `Failed to parse iCal feed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Fetches the raw ICS body for a URL with SSRF and resource-exhaustion guards:
 * scheme + host validation, DNS-resolution check, no automatic redirect
 * following (each hop is re-validated), an abort timeout, and a hard byte cap
 * read from the response stream.
 */
async function fetchIcalBody(
  url: string,
  fetchImpl: typeof fetch
): Promise<string> {
  let current = normalizeIcalUrl(url);
  const MAX_REDIRECTS = 5;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    // Re-validate every hop so a public host can't 30x-redirect to an internal
    // address (and the initial target is validated too).
    assertPublicHost(parsed);
    await assertResolvesPublic(parsed);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetchImpl(current, {
        headers: { Accept: "text/calendar, text/plain, */*" },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      logger.error(
        "Failed to fetch iCal feed",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
      throw new Error(
        `Failed to fetch iCal feed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    // Manual redirect handling: validate the next hop before following it.
    if (response.status >= 300 && response.status < 400) {
      clearTimeout(timer);
      const location = response.headers?.get?.("location");
      if (!location) {
        throw new Error("iCal feed returned a redirect with no location");
      }
      current = normalizeIcalUrl(new URL(location, current).toString());
      continue;
    }

    try {
      if (!response.ok) {
        throw new Error(`Failed to fetch iCal feed (HTTP ${response.status})`);
      }

      // Reject early when the server advertises an oversized payload.
      const contentLength = response.headers?.get?.("content-length");
      if (contentLength && Number(contentLength) > MAX_ICS_BYTES) {
        throw new Error("iCal feed is too large");
      }

      return await readBodyWithCap(response);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("iCal feed exceeded the maximum number of redirects");
}

/**
 * Reads a response body enforcing a hard byte cap. Prefers streaming so an
 * oversized or chunked (no Content-Length) response is aborted mid-read instead
 * of being fully buffered; falls back to `text()` when no stream is available
 * (e.g. mocked responses in tests).
 */
async function readBodyWithCap(response: Response): Promise<string> {
  const body = response.body as ReadableStream<Uint8Array> | null | undefined;

  if (!body || typeof body.getReader !== "function") {
    const text = await response.text();
    if (text.length > MAX_ICS_BYTES) {
      throw new Error("iCal feed is too large");
    }
    return text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let result = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > MAX_ICS_BYTES) {
          throw new Error("iCal feed is too large");
        }
        result += decoder.decode(value, { stream: true });
      }
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock?.();
  }
}

// Window around "now" to materialize recurring occurrences at sync time.
const EXPAND_PAST_MS = 366 * 24 * 60 * 60 * 1000; // ~1 year back
const EXPAND_FUTURE_MS = 2 * 366 * 24 * 60 * 60 * 1000; // ~2 years ahead

/**
 * Re-fetches an iCal feed's URL and replaces its stored events with what it
 * holds now. The refresh button and the background sync loop both run this.
 *
 * Fetching and parsing come before the transaction, so a feed that fails keeps
 * its last good events: the error is written to the feed and thrown.
 *
 * @returns How many rows the feed holds after the sync
 */
export async function syncIcalFeed(feed: {
  id: string;
  userId: string;
  url: string;
}): Promise<number> {
  let events: ParsedIcalEvent[];
  try {
    const parsed = await fetchIcalEvents(feed.url);
    const now = newDate();
    events = expandIcalEvents(
      parsed,
      new Date(now.getTime() - EXPAND_PAST_MS),
      new Date(now.getTime() + EXPAND_FUTURE_MS)
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync iCal feed";
    await prisma.calendarFeed.update({
      where: { id: feed.id, userId: feed.userId },
      data: { error: message },
    });
    throw new Error(message);
  }

  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.deleteMany({ where: { feedId: feed.id } });

    if (events.length > 0) {
      await tx.calendarEvent.createMany({
        data: events.map((event) => ({
          ...event,
          feedId: feed.id,
          start: newDate(event.start).toISOString(),
          end: newDate(event.end).toISOString(),
          created: event.created
            ? newDate(event.created).toISOString()
            : undefined,
          lastModified: event.lastModified
            ? newDate(event.lastModified).toISOString()
            : undefined,
        })),
        // A feed can list the same event twice; one row is enough, and a
        // repeat must not fail the whole sync on the unique index.
        skipDuplicates: true,
      });
    }

    await tx.calendarFeed.update({
      where: { id: feed.id, userId: feed.userId },
      data: { lastSync: newDate(), error: null },
    });
  });

  return events.length;
}
