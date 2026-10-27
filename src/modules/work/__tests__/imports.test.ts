import { parseContactRoster, parseShiftWeek } from "@/modules/work/imports";

const week = (shifts: unknown[], extra: Record<string, unknown> = {}) => ({
  source: "im",
  feedName: "IM Work",
  windowStart: "2026-10-12T00:00:00-04:00",
  windowEnd: "2026-10-19T00:00:00-04:00",
  shifts,
  ...extra,
});

const soccer = {
  key: "2026-10-16T19:15|7v7 Soccer",
  title: "IM · 7v7 Soccer",
  start: "2026-10-16T19:15:00-04:00",
  end: "2026-10-17T00:15:00-04:00",
  location: "Carter Field 1A/1B",
};

describe("parseShiftWeek", () => {
  it("accepts a week whose shift runs past midnight", () => {
    const parsed = parseShiftWeek(week([soccer]));
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.shifts[0].start.toISOString()).toBe(
      "2026-10-16T23:15:00.000Z"
    );
    expect(parsed.shifts[0].end.toISOString()).toBe("2026-10-17T04:15:00.000Z");
    expect(parsed.color).toBe("#E8590CFF");
  });

  it("treats an empty list as a week with no shifts", () => {
    const parsed = parseShiftWeek(week([]));
    expect(typeof parsed).not.toBe("string");
  });

  it("rejects a timestamp without an offset", () => {
    expect(
      parseShiftWeek(week([{ ...soccer, start: "2026-10-16T19:15:00" }]))
    ).toMatch(/offset/);
  });

  it("rejects a shift starting outside the window", () => {
    const early = {
      ...soccer,
      start: "2026-10-11T19:15:00-04:00",
      end: "2026-10-11T23:00:00-04:00",
    };
    expect(parseShiftWeek(week([early]))).toMatch(/outside the window/);
  });

  it("rejects duplicate keys and backwards shifts", () => {
    expect(parseShiftWeek(week([soccer, soccer]))).toMatch(/duplicate/);
    expect(parseShiftWeek(week([{ ...soccer, end: soccer.start }]))).toMatch(
      /ends before/
    );
  });

  it("rejects a window longer than a schedule week", () => {
    expect(
      parseShiftWeek(week([], { windowEnd: "2026-10-30T00:00:00-04:00" }))
    ).toMatch(/8 days/);
  });

  it("requires a slug source", () => {
    expect(parseShiftWeek(week([], { source: "IM Work" }))).toMatch(/slug/);
  });

  it("keeps role, supervisor and the schedule's own text", () => {
    const parsed = parseShiftWeek(
      week([
        {
          ...soccer,
          role: " Staff 1 ",
          supervisor: "Jamie Ortiz",
          description: "Staff 1\nFrom Week #2",
        },
      ])
    );
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.shifts[0]).toMatchObject({
      role: "Staff 1",
      supervisor: "Jamie Ortiz",
      details: "Staff 1\nFrom Week #2",
    });
  });

  it("leaves out a role or supervisor the source didn't send", () => {
    // ops' hand edits send a week back without them; the shift keeps its own.
    const parsed = parseShiftWeek(
      week([soccer, { ...soccer, key: "b", supervisor: null }])
    );
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.shifts[0].role).toBeUndefined();
    expect(parsed.shifts[0].supervisor).toBeUndefined();
    expect(parsed.shifts[1].supervisor).toBeNull();
  });

  it("skips a hand-added shift sent back with the week", () => {
    // ops' hand edits read a week and write it all back, hand-added
    // shifts included; those change through the Work API instead.
    const parsed = parseShiftWeek(
      week([soccer, { ...soccer, key: "hand-abc" }])
    );
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.shifts.map((s) => s.key)).toEqual([soccer.key]);
  });
});

describe("parseContactRoster", () => {
  const person = {
    key: "row-3",
    name: " Jamie Ortiz ",
    role: "Supervisor",
    phone: "617-555-0142",
  };

  it("takes a roster in order, trimmed", () => {
    const parsed = parseContactRoster({
      source: "im",
      contacts: [person, { key: "row-4", name: "Wren Okafor" }],
    });
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.contacts.map((c) => c.name)).toEqual([
      "Jamie Ortiz",
      "Wren Okafor",
    ]);
    expect(parsed.contacts[1]).toMatchObject({
      role: null,
      phone: null,
      email: null,
    });
  });

  it("rejects a contact with no name or a repeated key", () => {
    expect(
      parseContactRoster({ source: "im", contacts: [{ key: "a", name: " " }] })
    ).toMatch(/name/);
    expect(
      parseContactRoster({ source: "im", contacts: [person, person] })
    ).toMatch(/duplicate/);
  });

  it("requires a slug source and a list", () => {
    expect(parseContactRoster({ source: "IM", contacts: [] })).toMatch(/slug/);
    expect(parseContactRoster({ source: "im" })).toMatch(/list/);
  });
});
