import {
  CALENDAR_PROVIDERS,
  classifyPastedLink,
  providerById,
  providerForEmail,
} from "@/lib/calendar-providers";

describe("CALENDAR_PROVIDERS", () => {
  it("has a unique id for every provider", () => {
    const ids = CALENDAR_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every non-prompt CalDAV provider an https serverUrl", () => {
    for (const provider of CALENDAR_PROVIDERS) {
      if (provider.method !== "caldav" || provider.serverPrompt) continue;
      expect(provider.caldav?.serverUrl).toMatch(/^https:\/\//);
    }
  });

  it("does not list the same domain under two providers", () => {
    const seen = new Map<string, string>();
    for (const provider of CALENDAR_PROVIDERS) {
      for (const domain of provider.domains) {
        expect(seen.has(domain)).toBe(false);
        seen.set(domain, provider.id);
      }
    }
  });
});

describe("providerById", () => {
  it("returns the provider for a known id", () => {
    expect(providerById("icloud")?.name).toBe("iCloud");
  });

  it("returns undefined for an unknown id", () => {
    expect(providerById("nope")).toBeUndefined();
  });
});

describe("providerForEmail", () => {
  it.each([
    ["Me@ICloud.com", "icloud"],
    ["a@gmail.com", "google"],
    ["x@hotmail.co.uk", "microsoft"],
    ["x@proton.me", "proton"],
  ])("maps %s to %s", (email, id) => {
    expect(providerForEmail(email)?.id).toBe(id);
  });

  it.each(["x@example.org", "nope"])(
    "returns undefined for %s",
    (email) => {
      expect(providerForEmail(email)).toBeUndefined();
    }
  );
});

describe("classifyPastedLink", () => {
  it("treats a webcal published link as ical over https", () => {
    expect(
      classifyPastedLink(
        "webcal://p01-caldav.icloud.com/published/2/abc"
      )
    ).toEqual({
      kind: "ical",
      url: "https://p01-caldav.icloud.com/published/2/abc",
    });
  });

  it("treats a Google ical path as ical", () => {
    expect(
      classifyPastedLink(
        "https://calendar.google.com/calendar/ical/abc/basic.ics"
      )
    ).toEqual({
      kind: "ical",
      url: "https://calendar.google.com/calendar/ical/abc/basic.ics",
    });
  });

  it("treats an Outlook .ics link as ical", () => {
    expect(
      classifyPastedLink(
        "https://outlook.office365.com/owa/calendar/x/y/calendar.ics"
      )
    ).toEqual({
      kind: "ical",
      url: "https://outlook.office365.com/owa/calendar/x/y/calendar.ics",
    });
  });

  it("treats a CalDAV dav path as caldav", () => {
    expect(
      classifyPastedLink("https://cloud.example.org/remote.php/dav")
    ).toEqual({
      kind: "caldav",
      url: "https://cloud.example.org/remote.php/dav",
    });
  });

  it.each(["ftp://x", "not a url"])("rejects %s as invalid", (input) => {
    expect(classifyPastedLink(input)).toEqual({ kind: "invalid" });
  });
});
