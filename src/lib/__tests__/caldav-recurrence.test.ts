import { CalendarEvent, ConnectedAccount } from "@prisma/client";

import { CalDAVCalendarService } from "@/lib/caldav-calendar";

/**
 * A CalDAV series expands from its own VEVENT (src/lib/ical-recurrence.ts):
 * in the time zone of its DTSTART and without its EXDATEs. The old expansion
 * anchored rrule on the UTC start, so a weekly 9:00 New York event showed at
 * 8:00 once daylight saving ended, and an EXDATE'd occurrence still showed.
 */

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const stubAccount = {
  id: "acct-1",
  email: "user@example.com",
  caldavUsername: "user@example.com",
  accessToken: "token",
  caldavUrl: "https://dav.example.com",
} as unknown as ConnectedAccount;

const SERIES = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VTIMEZONE
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
END:VTIMEZONE
BEGIN:VEVENT
UID:lecture@example.com
SUMMARY:CS 3500 lecture
DTSTART;TZID=America/New_York:20261026T090000
DTEND;TZID=America/New_York:20261026T100000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=America/New_York:20261109T090000
END:VEVENT
END:VCALENDAR`;

interface Internals {
  processCalendarObjects(objects: unknown[]): Promise<CalendarEvent[]>;
  expandRecurringEvents(masters: CalendarEvent[]): Promise<CalendarEvent[]>;
  getTimeRange(): { start: Date; end: Date };
}

describe("CalDAV series expansion", () => {
  it("keeps the wall-clock time across daylight saving and drops EXDATEs", async () => {
    const service = new CalDAVCalendarService(stubAccount) as unknown as Internals;
    jest.spyOn(service, "getTimeRange").mockReturnValue({
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2027-12-31T00:00:00.000Z"),
    });

    const masters = await service.processCalendarObjects([
      { href: "/cal/lecture.ics", props: { "calendar-data": SERIES } },
    ]);
    expect(masters).toHaveLength(1);
    expect(masters[0].start.toISOString()).toBe("2026-10-26T13:00:00.000Z");

    const instances = await service.expandRecurringEvents(masters);
    // The master row is the first occurrence; the rest come from the series:
    // November 2 at 9:00 EST (14:00Z), November 9 cancelled, November 16.
    expect(instances.map((e) => e.start.toISOString())).toEqual([
      "2026-11-02T14:00:00.000Z",
      "2026-11-16T14:00:00.000Z",
    ]);
    expect(instances.every((e) => e.end.getTime() - e.start.getTime() === 3600_000)).toBe(true);
  });
});
