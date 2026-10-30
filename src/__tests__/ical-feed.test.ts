import {
  expandIcalEvents,
  fetchIcalEvents,
  normalizeIcalUrl,
  parseIcalEvents,
} from "@/lib/ical-feed";
import { assertPublicHost } from "@/lib/net/public-host";

const SINGLE_EVENT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:single-1@example.com
SUMMARY:Single Event
DESCRIPTION:A one-off event
LOCATION:Munich
DTSTART:20260101T100000Z
DTEND:20260101T110000Z
END:VEVENT
END:VCALENDAR`;

const RECURRING_EVENT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:recurring-1@example.com
SUMMARY:Weekly Standup
DTSTART:20260105T090000Z
DTEND:20260105T093000Z
RRULE:FREQ=WEEKLY;BYDAY=MO
END:VEVENT
END:VCALENDAR`;

const ALL_DAY_EVENT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:allday-1@example.com
SUMMARY:Holiday
DTSTART;VALUE=DATE:20260101
DTEND;VALUE=DATE:20260102
END:VEVENT
END:VCALENDAR`;

// Weekly Mondays from 2026-01-05, with the 2026-01-19 occurrence cancelled
// via EXDATE. The cancelled date must not be materialized.
const RECURRING_WITH_EXDATE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:recurring-exdate-1@example.com
SUMMARY:Weekly Standup
DTSTART:20260105T090000Z
DTEND:20260105T093000Z
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE:20260119T090000Z
END:VEVENT
END:VCALENDAR`;

const MULTI_EVENT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:single-1@example.com
SUMMARY:Single Event
DTSTART:20260101T100000Z
DTEND:20260101T110000Z
END:VEVENT
BEGIN:VEVENT
UID:recurring-1@example.com
SUMMARY:Weekly Standup
DTSTART:20260105T090000Z
DTEND:20260105T093000Z
RRULE:FREQ=WEEKLY;BYDAY=MO
END:VEVENT
END:VCALENDAR`;

describe("normalizeIcalUrl", () => {
  it("passes through https URLs unchanged", () => {
    expect(normalizeIcalUrl("https://example.com/cal.ics")).toBe(
      "https://example.com/cal.ics"
    );
  });

  it("passes through http URLs unchanged", () => {
    expect(normalizeIcalUrl("http://example.com/cal.ics")).toBe(
      "http://example.com/cal.ics"
    );
  });

  it("rewrites webcal:// to https://", () => {
    expect(normalizeIcalUrl("webcal://example.com/cal.ics")).toBe(
      "https://example.com/cal.ics"
    );
  });

  it("rewrites webcals:// to https://", () => {
    expect(normalizeIcalUrl("webcals://example.com/cal.ics")).toBe(
      "https://example.com/cal.ics"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeIcalUrl("  https://example.com/cal.ics  ")).toBe(
      "https://example.com/cal.ics"
    );
  });

  it("rejects unsupported schemes", () => {
    expect(() => normalizeIcalUrl("file:///etc/passwd")).toThrow();
    expect(() => normalizeIcalUrl("ftp://example.com/cal.ics")).toThrow();
  });

  it("rejects empty input", () => {
    expect(() => normalizeIcalUrl("")).toThrow();
    expect(() => normalizeIcalUrl("   ")).toThrow();
  });
});

describe("parseIcalEvents", () => {
  it("parses a single one-off event", () => {
    const events = parseIcalEvents(SINGLE_EVENT_ICS);
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.title).toBe("Single Event");
    expect(event.location).toBe("Munich");
    expect(event.isRecurring).toBe(false);
    expect(event.allDay).toBe(false);
    expect(event.start).toBeInstanceOf(Date);
    expect(event.end).toBeInstanceOf(Date);
  });

  it("parses a recurring master with its recurrence rule", () => {
    const events = parseIcalEvents(RECURRING_EVENT_ICS);
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.title).toBe("Weekly Standup");
    expect(event.isRecurring).toBe(true);
    expect(event.isMaster).toBe(true);
    expect(event.recurrenceRule).toContain("FREQ=WEEKLY");
  });

  it("marks date-only events as all-day", () => {
    const events = parseIcalEvents(ALL_DAY_EVENT_ICS);
    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(true);
  });

  it("parses multiple VEVENTs", () => {
    const events = parseIcalEvents(MULTI_EVENT_ICS);
    expect(events).toHaveLength(2);
    const titles = events.map((e) => e.title).sort();
    expect(titles).toEqual(["Single Event", "Weekly Standup"]);
  });

  it("returns an empty array for a calendar with no events", () => {
    const empty = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//test//EN\nEND:VCALENDAR`;
    expect(parseIcalEvents(empty)).toEqual([]);
  });

  it("throws on a body that is not a valid calendar", () => {
    expect(() => parseIcalEvents("this is not an ical document")).toThrow();
  });

  it("does not include placeholder feedId on parsed events", () => {
    const events = parseIcalEvents(SINGLE_EVENT_ICS);
    // feedId is assigned when persisting; parsed events should not carry a
    // bogus empty feedId that would override the DB write.
    expect((events[0] as Record<string, unknown>).feedId).toBeUndefined();
  });

  it("does not carry DB-level recurrence instance linkage", () => {
    // Instances are materialized standalone (no self-FK), so masterEventId must
    // be null to avoid an FK violation on insert.
    const events = parseIcalEvents(RECURRING_EVENT_ICS);
    expect(events[0].masterEventId).toBeNull();
    expect(events[0].recurringEventId).toBeNull();
  });
});

describe("expandIcalEvents", () => {
  const windowStart = new Date("2026-01-01T00:00:00.000Z");
  const windowEnd = new Date("2026-02-28T00:00:00.000Z");

  it("leaves a one-off event unchanged", () => {
    const parsed = parseIcalEvents(SINGLE_EVENT_ICS);
    const expanded = expandIcalEvents(parsed, windowStart, windowEnd);
    expect(expanded).toHaveLength(1);
    expect(expanded[0].isMaster).toBe(false);
    expect(expanded[0].title).toBe("Single Event");
  });

  it("materializes recurring occurrences within the window as renderable rows", () => {
    const parsed = parseIcalEvents(RECURRING_EVENT_ICS); // weekly Mondays from 2026-01-05
    const expanded = expandIcalEvents(parsed, windowStart, windowEnd);

    const master = expanded.filter((e) => e.isMaster);
    const instances = expanded.filter((e) => !e.isMaster);

    // A master row is kept (preserves recurrence metadata) but is skipped at
    // render time; the instances are what actually render.
    expect(master).toHaveLength(1);
    expect(master[0].recurrenceRule).toContain("FREQ=WEEKLY");

    // Mondays Jan 5..Feb 23 2026 = 8 occurrences.
    expect(instances.length).toBeGreaterThanOrEqual(7);
    instances.forEach((inst) => {
      expect(inst.isMaster).toBe(false);
      expect(inst.isRecurring).toBe(false);
      expect(inst.masterEventId).toBeNull();
      expect(inst.title).toBe("Weekly Standup");
      expect(inst.start.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
      expect(inst.start.getTime()).toBeLessThanOrEqual(windowEnd.getTime());
    });
  });

  it("preserves each occurrence's duration", () => {
    const parsed = parseIcalEvents(RECURRING_EVENT_ICS); // 30-min events
    const expanded = expandIcalEvents(parsed, windowStart, windowEnd);
    const instance = expanded.find((e) => !e.isMaster)!;
    expect(instance.end.getTime() - instance.start.getTime()).toBe(30 * 60_000);
  });

  it("does not materialize occurrences cancelled via EXDATE", () => {
    const parsed = parseIcalEvents(RECURRING_WITH_EXDATE_ICS);
    const expanded = expandIcalEvents(parsed, windowStart, windowEnd);
    const cancelled = new Date("2026-01-19T09:00:00.000Z").getTime();

    const instances = expanded.filter((e) => !e.isMaster);
    // The cancelled Monday must be absent from the materialized instances.
    expect(
      instances.some((inst) => inst.start.getTime() === cancelled)
    ).toBe(false);
    // Other Mondays in the window are still materialized.
    const other = new Date("2026-01-12T09:00:00.000Z").getTime();
    expect(instances.some((inst) => inst.start.getTime() === other)).toBe(true);
  });

  it("bounds a high-frequency unbounded rule to the instance cap quickly", () => {
    // A hostile feed with FREQ=SECONDLY and no COUNT/UNTIL would produce tens of
    // millions of occurrences across the window. Generation must be bounded (not
    // just the result sliced), so this completes fast and stays capped.
    const secondly = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:flood-1@example.com
SUMMARY:Flood
DTSTART:20260101T000000Z
DTEND:20260101T000100Z
RRULE:FREQ=SECONDLY
END:VEVENT
END:VCALENDAR`;
    const parsed = parseIcalEvents(secondly);
    const wideEnd = new Date("2029-01-01T00:00:00.000Z");

    const t0 = Date.now();
    const expanded = expandIcalEvents(parsed, windowStart, wideEnd);
    const elapsed = Date.now() - t0;

    const instances = expanded.filter((e) => !e.isMaster);
    // Sigwald refuses rules finer than daily outright (src/lib/ical-recurrence.ts):
    // no calendar app writes one, so it keeps its master and expands to nothing.
    expect(instances.length).toBe(0);
    expect(expanded.filter((e) => e.isMaster)).toHaveLength(1);
    // Bounded generation keeps this well under a second even on slow CI.
    expect(elapsed).toBeLessThan(5000);
  });

  it("caps total materialized rows across many recurring masters", () => {
    // 60 masters x up to 1000 instances each would be 60k rows; the feed-level
    // cap (50k) must stop expansion so a small-but-dense feed can't blow up the
    // bulk insert. Daily series over three years give each master its full
    // 1000 (finer rules aren't expanded at all).
    const masters = Array.from({ length: 60 }, (_, n) => {
      const min = String(n % 60).padStart(2, "0");
      return `BEGIN:VEVENT
UID:flood-${n}@example.com
SUMMARY:Flood ${n}
DTSTART:20260101T00${min}00Z
DTEND:20260101T00${min}30Z
RRULE:FREQ=DAILY
END:VEVENT`;
    }).join("\n");
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//test//EN\n${masters}\nEND:VCALENDAR`;

    const parsed = parseIcalEvents(ics);
    const expanded = expandIcalEvents(
      parsed,
      windowStart,
      new Date("2029-01-01T00:00:00.000Z")
    );

    // Hard ceiling enforced regardless of how many masters/instances were asked.
    expect(expanded.length).toBeLessThanOrEqual(50_000);
    // And it did materialize a large number (proving the cap, not an early bail).
    expect(expanded.length).toBeGreaterThan(40_000);
  });

  it("keeps a master with an unparseable rule as a single fallback row", () => {
    const parsed = parseIcalEvents(RECURRING_EVENT_ICS);
    // Corrupt the rule so RRule.fromString throws.
    parsed[0].recurrenceRule = "NOT-A-VALID-RULE";
    const expanded = expandIcalEvents(parsed, windowStart, windowEnd);
    // Falls back to keeping the original event so it isn't silently dropped.
    expect(expanded.length).toBeGreaterThanOrEqual(1);
  });
});

describe("assertPublicHost", () => {
  it("allows ordinary public hostnames", () => {
    expect(() =>
      assertPublicHost(new URL("https://calendar.example.com/cal.ics"))
    ).not.toThrow();
  });

  it("rejects localhost", () => {
    expect(() =>
      assertPublicHost(new URL("http://localhost/cal.ics"))
    ).toThrow();
    expect(() =>
      assertPublicHost(new URL("http://LOCALHOST:8080/cal.ics"))
    ).toThrow();
  });

  it("rejects loopback IPs", () => {
    expect(() =>
      assertPublicHost(new URL("http://127.0.0.1/cal.ics"))
    ).toThrow();
    expect(() => assertPublicHost(new URL("http://[::1]/cal.ics"))).toThrow();
  });

  it("rejects private IPv4 ranges", () => {
    expect(() =>
      assertPublicHost(new URL("http://10.0.0.5/cal.ics"))
    ).toThrow();
    expect(() =>
      assertPublicHost(new URL("http://192.168.1.10/cal.ics"))
    ).toThrow();
    expect(() =>
      assertPublicHost(new URL("http://172.16.5.5/cal.ics"))
    ).toThrow();
  });

  it("rejects link-local and cloud metadata addresses", () => {
    expect(() =>
      assertPublicHost(new URL("http://169.254.169.254/latest/meta-data/"))
    ).toThrow();
  });

  it("rejects the .internal TLD", () => {
    expect(() =>
      assertPublicHost(new URL("http://metadata.internal/cal.ics"))
    ).toThrow();
  });

  it("rejects IPv4-mapped IPv6 loopback/metadata literals", () => {
    // Node canonicalizes the bracketed dotted form to the hex form
    // (::ffff:127.0.0.1 -> ::ffff:7f00:1), which an earlier dotted-only check
    // missed - letting a user reach loopback/metadata via a mapped literal.
    expect(() =>
      assertPublicHost(new URL("http://[::ffff:127.0.0.1]/cal.ics"))
    ).toThrow();
    expect(() =>
      assertPublicHost(new URL("http://[::ffff:7f00:1]/cal.ics"))
    ).toThrow();
    expect(() =>
      assertPublicHost(new URL("http://[::ffff:169.254.169.254]/meta"))
    ).toThrow();
    expect(() =>
      assertPublicHost(new URL("http://[::ffff:a9fe:a9fe]/meta"))
    ).toThrow();
    expect(() =>
      assertPublicHost(new URL("http://[::ffff:10.0.0.1]/cal.ics"))
    ).toThrow();
  });

  it("still allows an IPv4-mapped IPv6 public address", () => {
    // A mapped public address (8.8.8.8 -> ::ffff:808:808) must NOT be rejected.
    expect(() =>
      assertPublicHost(new URL("http://[::ffff:808:808]/cal.ics"))
    ).not.toThrow();
  });
});

describe("fetchIcalEvents", () => {
  it("fetches the URL and returns parsed events", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => SINGLE_EVENT_ICS,
    });

    const events = await fetchIcalEvents(
      "https://example.com/cal.ics",
      fetchImpl as unknown as typeof fetch
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.com/cal.ics",
      expect.any(Object)
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Single Event");
  });

  it("normalizes webcal URLs before fetching", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => SINGLE_EVENT_ICS,
    });

    await fetchIcalEvents(
      "webcal://example.com/cal.ics",
      fetchImpl as unknown as typeof fetch
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.com/cal.ics",
      expect.any(Object)
    );
  });

  it("throws when the response is not ok", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    });

    await expect(
      fetchIcalEvents(
        "https://example.com/missing.ics",
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toThrow();
  });

  it("throws when the body cannot be parsed", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "garbage not ical",
    });

    await expect(
      fetchIcalEvents(
        "https://example.com/bad.ics",
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toThrow();
  });
});

// Sigwald's additions to the upstream port: a moved occurrence (RECURRENCE-ID)
// replaces the one it moves, and a VEVENT the converter can't read is dropped.

// Weekly Mondays at 09:00 from 2026-01-05; the 2026-01-12 occurrence moved to
// Tuesday 2026-01-13 at 14:00 and renamed.
const RECURRING_WITH_OVERRIDE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:class-1@example.com
SUMMARY:CS 3500 lecture
DTSTART:20260105T090000Z
DTEND:20260105T100000Z
RRULE:FREQ=WEEKLY;BYDAY=MO
END:VEVENT
BEGIN:VEVENT
UID:class-1@example.com
RECURRENCE-ID:20260112T090000Z
SUMMARY:CS 3500 lecture (moved)
DTSTART:20260113T140000Z
DTEND:20260113T150000Z
END:VEVENT
END:VCALENDAR`;

// The first occurrence overridden without moving it: same start as the series.
const OVERRIDE_AT_SERIES_START_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:class-2@example.com
SUMMARY:Lab
DTSTART:20260105T090000Z
DTEND:20260105T100000Z
RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:class-2@example.com
RECURRENCE-ID:20260105T090000Z
SUMMARY:Lab (room change)
DTSTART:20260105T090000Z
DTEND:20260105T100000Z
END:VEVENT
END:VCALENDAR`;

const UNREADABLE_EVENT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:no-start@example.com
SUMMARY:No start time
END:VEVENT
BEGIN:VEVENT
UID:fine@example.com
SUMMARY:Fine
DTSTART:20260101T100000Z
DTEND:20260101T110000Z
END:VEVENT
END:VCALENDAR`;

describe("overrides and unreadable events", () => {
  const windowStart = new Date("2026-01-01T00:00:00.000Z");
  const windowEnd = new Date("2026-02-28T00:00:00.000Z");

  it("shows a moved occurrence once, at its new time", () => {
    const expanded = expandIcalEvents(
      parseIcalEvents(RECURRING_WITH_OVERRIDE_ICS),
      windowStart,
      windowEnd
    );
    const rendered = expanded.filter((e) => !e.isMaster);
    const starts = rendered.map((e) => new Date(e.start).toISOString());

    expect(starts).not.toContain("2026-01-12T09:00:00.000Z");
    expect(starts).toContain("2026-01-13T14:00:00.000Z");
    expect(starts).toContain("2026-01-19T09:00:00.000Z");

    const moved = rendered.find(
      (e) => new Date(e.start).toISOString() === "2026-01-13T14:00:00.000Z"
    );
    expect(moved?.title).toBe("CS 3500 lecture (moved)");
    expect(moved?.isRecurring).toBe(false);
    // It takes the id of the occurrence it replaces.
    expect(moved?.externalEventId).toBe(
      "class-1@example.com_2026-01-12T09:00:00.000Z"
    );
  });

  it("keeps every row unique on (externalEventId, start), even when an override keeps the series start", () => {
    const expanded = expandIcalEvents(
      parseIcalEvents(OVERRIDE_AT_SERIES_START_ICS),
      windowStart,
      windowEnd
    );
    const keys = expanded.map(
      (e) => `${e.externalEventId}|${new Date(e.start).toISOString()}`
    );
    expect(new Set(keys).size).toBe(keys.length);

    const rendered = expanded.filter((e) => !e.isMaster);
    const firstWeek = rendered.filter(
      (e) => new Date(e.start).toISOString() === "2026-01-05T09:00:00.000Z"
    );
    expect(firstWeek).toHaveLength(1);
    expect(firstWeek[0].title).toBe("Lab (room change)");
    expect(rendered).toHaveLength(3);
  });

  it("persists none of the internal parse fields", () => {
    const expanded = expandIcalEvents(
      parseIcalEvents(RECURRING_WITH_OVERRIDE_ICS),
      windowStart,
      windowEnd
    );
    for (const event of expanded) {
      expect(event).not.toHaveProperty("recurrenceId");
      expect(event).not.toHaveProperty("exdates");
    }
  });

  it("drops a VEVENT it can't read instead of showing a placeholder", () => {
    const parsed = parseIcalEvents(UNREADABLE_EVENT_ICS);
    expect(parsed.map((e) => e.title)).toEqual(["Fine"]);
  });
});

// From the review of the port: daylight-saving changes, rules that start long
// before the window, and cancellations.
const NY_VTIMEZONE = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;

const calendar = (body: string) =>
  `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//test//EN\n${NY_VTIMEZONE}\n${body}\nEND:VCALENDAR`;

describe("series expansion", () => {
  it("keeps a weekly 9:00 class at 9:00 across the end of daylight saving", () => {
    const expanded = expandIcalEvents(
      parseIcalEvents(
        calendar(`BEGIN:VEVENT
UID:dst@example.com
SUMMARY:CS 3500 lecture
DTSTART;TZID=America/New_York:20261026T090000
DTEND;TZID=America/New_York:20261026T100000
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT`)
      ),
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-12-01T00:00:00.000Z")
    );
    const starts = expanded
      .filter((e) => !e.isMaster)
      .map((e) => new Date(e.start).toISOString());
    // 9:00 EDT is 13:00Z; after November 1, 9:00 EST is 14:00Z.
    expect(starts).toEqual([
      "2026-10-26T13:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
      "2026-11-09T14:00:00.000Z",
    ]);
  });

  it("bounds a high-frequency rule that starts years before the window", () => {
    const started = Date.now();
    const expanded = expandIcalEvents(
      parseIcalEvents(
        calendar(`BEGIN:VEVENT
UID:secondly@example.com
SUMMARY:Spam
DTSTART:20200101T000000Z
DTEND:20200101T000001Z
RRULE:FREQ=SECONDLY
END:VEVENT`)
      ),
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2027-01-01T00:00:00.000Z")
    );
    expect(Date.now() - started).toBeLessThan(2000);
    // It never reaches the window, so only the master row is kept.
    expect(expanded.filter((e) => !e.isMaster)).toHaveLength(0);
  });

  it("honors RDATE extra dates", () => {
    const expanded = expandIcalEvents(
      parseIcalEvents(
        calendar(`BEGIN:VEVENT
UID:rdate@example.com
SUMMARY:Review session
DTSTART:20260105T090000Z
DTEND:20260105T100000Z
RRULE:FREQ=WEEKLY;COUNT=2
RDATE:20260107T090000Z
END:VEVENT`)
      ),
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-02-01T00:00:00.000Z")
    );
    expect(
      expanded.filter((e) => !e.isMaster).map((e) => new Date(e.start).toISOString())
    ).toEqual([
      "2026-01-05T09:00:00.000Z",
      "2026-01-07T09:00:00.000Z",
      "2026-01-12T09:00:00.000Z",
    ]);
  });

  it("leaves cancelled events off, and a cancelled override removes its occurrence", () => {
    const expanded = expandIcalEvents(
      parseIcalEvents(
        calendar(`BEGIN:VEVENT
UID:series@example.com
SUMMARY:Lab
DTSTART:20260105T090000Z
DTEND:20260105T100000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:series@example.com
RECURRENCE-ID:20260112T090000Z
SUMMARY:Lab
STATUS:CANCELLED
DTSTART:20260112T090000Z
DTEND:20260112T100000Z
END:VEVENT
BEGIN:VEVENT
UID:gone@example.com
SUMMARY:Called off
STATUS:CANCELLED
DTSTART:20260110T090000Z
DTEND:20260110T100000Z
END:VEVENT`)
      ),
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-02-01T00:00:00.000Z")
    );
    const rendered = expanded.filter((e) => !e.isMaster);
    expect(rendered.map((e) => new Date(e.start).toISOString())).toEqual([
      "2026-01-05T09:00:00.000Z",
      "2026-01-19T09:00:00.000Z",
    ]);
    expect(rendered.some((e) => e.title === "Called off")).toBe(false);
  });

  it("persists no VEVENT source on any row", () => {
    const expanded = expandIcalEvents(
      parseIcalEvents(RECURRING_EVENT_ICS),
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-02-28T00:00:00.000Z")
    );
    for (const event of expanded) expect(event).not.toHaveProperty("source");
  });
});

// From the second review: rules ical.js's own iterator can't survive.
describe("series expansion stays bounded on hostile rules", () => {
  const windowStart = new Date("2026-01-01T00:00:00.000Z");
  const windowEnd = new Date("2028-01-01T00:00:00.000Z");
  const series = (rule: string, extra = "") =>
    calendar(`BEGIN:VEVENT
UID:hostile@example.com
SUMMARY:Hostile
DTSTART:20251231T235959Z
DTEND:20260101T000059Z
RRULE:${rule}
${extra}END:VEVENT`);

  it.each([
    ["a rule that never matches", "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30"],
    ["an hourly rule that never matches", "FREQ=HOURLY;BYMONTH=2;BYMONTHDAY=30"],
    ["a weekly rule that never matches", "FREQ=WEEKLY;BYMONTH=2;BYMONTHDAY=31"],
    ["a daily rule with a position it never has", "FREQ=DAILY;BYSETPOS=5"],
    ["a secondly rule that skips eleven months", "FREQ=SECONDLY;BYMONTH=12;COUNT=2"],
    ["a minutely rule", "FREQ=MINUTELY"],
  ])("finishes %s quickly", (_label, rule) => {
    const started = Date.now();
    const expanded = expandIcalEvents(parseIcalEvents(series(rule)), windowStart, windowEnd);
    // A guard against hangs, not a benchmark: BYSETPOS=5 takes ~0.3 s here and
    // over 1.5 s on a shared CI runner, while the iterator it replaced never returned.
    expect(Date.now() - started).toBeLessThan(5000);
    expect(expanded.filter((e) => e.isMaster)).toHaveLength(1);
  });

  it("keeps the regular occurrences when an RDATE is a period, and adds its start", () => {
    const expanded = expandIcalEvents(
      parseIcalEvents(
        calendar(`BEGIN:VEVENT
UID:period@example.com
SUMMARY:Review session
DTSTART:20260105T090000Z
DTEND:20260105T100000Z
RRULE:FREQ=WEEKLY;COUNT=2
RDATE;VALUE=PERIOD:20260107T090000Z/20260107T110000Z
END:VEVENT`)
      ),
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-02-01T00:00:00.000Z")
    );
    expect(
      expanded.filter((e) => !e.isMaster).map((e) => new Date(e.start).toISOString())
    ).toEqual([
      "2026-01-05T09:00:00.000Z",
      "2026-01-07T09:00:00.000Z",
      "2026-01-12T09:00:00.000Z",
    ]);
  });
});

it("keeps the wall-clock time for Outlook's Windows zone names, through the feed's VTIMEZONE", () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
BEGIN:VTIMEZONE
TZID:Eastern Standard Time
BEGIN:STANDARD
DTSTART:16010101T020000
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=1SU;BYMONTH=11
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T020000
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=2SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:outlook-series@example.com
SUMMARY:Team sync
DTSTART;TZID=Eastern Standard Time:20261026T090000
DTEND;TZID=Eastern Standard Time:20261026T093000
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
END:VCALENDAR`;
  const starts = expandIcalEvents(
    parseIcalEvents(ics),
    new Date("2026-10-01T00:00:00.000Z"),
    new Date("2026-12-01T00:00:00.000Z")
  )
    .filter((e) => !e.isMaster)
    .map((e) => new Date(e.start).toISOString());
  expect(starts).toEqual([
    "2026-10-26T13:00:00.000Z",
    "2026-11-02T14:00:00.000Z",
    "2026-11-09T14:00:00.000Z",
  ]);
});

const listUpTo = (n: number) => Array.from({ length: n }, (_, k) => k).join(",");

describe("series expansion stays bounded on dense rules", () => {
  it("refuses a daily rule that lists every hour, minute and second", () => {
    const started = Date.now();
    const expanded = expandIcalEvents(
      parseIcalEvents(
        calendar(`BEGIN:VEVENT
UID:dense@example.com
SUMMARY:Dense
DTSTART:20260101T000000Z
DTEND:20260101T000001Z
RRULE:FREQ=DAILY;BYHOUR=${listUpTo(24)};BYMINUTE=${listUpTo(60)};BYSECOND=${listUpTo(60)}
END:VEVENT`)
      ),
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2029-01-01T00:00:00.000Z")
    );
    expect(Date.now() - started).toBeLessThan(1500);
    expect(expanded.filter((e) => !e.isMaster)).toHaveLength(0);
  });

  it("expands a daily rule with every hour, stopping at the instance cap", () => {
    const started = Date.now();
    const expanded = expandIcalEvents(
      parseIcalEvents(
        calendar(`BEGIN:VEVENT
UID:hourly-by-list@example.com
SUMMARY:Every hour
DTSTART:20260101T000000Z
DTEND:20260101T000500Z
RRULE:FREQ=DAILY;BYHOUR=${listUpTo(24)}
END:VEVENT`)
      ),
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2029-01-01T00:00:00.000Z")
    );
    expect(Date.now() - started).toBeLessThan(1500);
    expect(expanded.filter((e) => !e.isMaster)).toHaveLength(1000);
  });
});

it("counts the instance cap after EXDATEs, so a series with many keeps its later occurrences", () => {
  const exdates = Array.from({ length: 100 }, (_, k) => {
    const d = new Date(Date.UTC(2026, 0, 1 + k));
    return `EXDATE:${d.toISOString().slice(0, 10).replace(/-/g, "")}T000000Z`;
  }).join("\n");
  const expanded = expandIcalEvents(
    parseIcalEvents(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:many-exdates@example.com
SUMMARY:Daily
DTSTART:20260101T000000Z
DTEND:20260101T003000Z
RRULE:FREQ=DAILY
${exdates}
END:VEVENT
END:VCALENDAR`),
    new Date("2026-01-01T00:00:00.000Z"),
    new Date("2029-01-01T00:00:00.000Z")
  );
  const rendered = expanded.filter((e) => !e.isMaster);
  // 1,097 days from January 1, 2026 through January 1, 2029, less 100 EXDATEs.
  expect(rendered).toHaveLength(997);
  expect(new Date(rendered[rendered.length - 1].start).toISOString()).toBe(
    "2029-01-01T00:00:00.000Z"
  );
});
