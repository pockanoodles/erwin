import { type DiscoveryDeps, discoverCalendar, emailDomain } from "../calendar-discovery";

const none = () => Promise.reject(Object.assign(new Error("no data"), { code: "ENODATA" }));

function deps(overrides: Partial<DiscoveryDeps> = {}): DiscoveryDeps {
  return {
    resolveMx: none,
    resolveSrv: none,
    resolveTxt: none,
    fetch: jest.fn().mockResolvedValue(new Response(null, { status: 404 })),
    assertPublic: async () => {},
    ...overrides,
  };
}

const mx = (...exchanges: string[]) => async () =>
  exchanges.map((exchange, i) => ({ exchange, priority: i * 10 }));

describe("discoverCalendar", () => {
  it("answers a known domain without any lookup", async () => {
    const d = deps({ resolveMx: jest.fn() });
    expect(await discoverCalendar("me@icloud.com", d)).toEqual({
      kind: "provider",
      providerId: "icloud",
      via: "domain",
    });
    expect(d.resolveMx).not.toHaveBeenCalled();
  });

  it("reads Google Workspace and Microsoft 365 from a company's mail records", async () => {
    expect(
      await discoverCalendar("a@acme.com", deps({ resolveMx: mx("aspmx.l.google.com.") }))
    ).toMatchObject({ kind: "provider", providerId: "google", via: "mx" });
    expect(
      await discoverCalendar(
        "a@contoso.com",
        deps({ resolveMx: mx("contoso-com.mail.protection.outlook.com") })
      )
    ).toMatchObject({ providerId: "microsoft" });
  });

  it("keeps a Zoho EU domain on Zoho's EU calendar server", async () => {
    expect(
      await discoverCalendar("a@firma.de", deps({ resolveMx: mx("mx.zoho.eu", "mx2.zoho.eu") }))
    ).toEqual({
      kind: "provider",
      providerId: "zoho",
      serverUrl: "https://calendar.zoho.eu",
      via: "mx",
    });
  });

  it("doesn't take a lookalike mail host for the real one", async () => {
    expect(
      await discoverCalendar("a@x.com", deps({ resolveMx: mx("mail.notgoogle.com") }))
    ).toEqual({ kind: "unknown" });
  });

  it("follows a CalDAV SRV record and its path", async () => {
    const found = await discoverCalendar(
      "a@example.org",
      deps({
        resolveMx: mx("mx.example.org"),
        resolveSrv: async () => [
          { name: "backup.example.org", port: 443, priority: 10, weight: 0 },
          { name: "dav.example.org.", port: 8443, priority: 0, weight: 1 },
        ],
        resolveTxt: async () => [["path=/dav/"]],
      })
    );
    expect(found).toEqual({
      kind: "caldav",
      serverUrl: "https://dav.example.org:8443/dav",
      via: "srv",
    });
  });

  it("ignores an SRV record that says CalDAV isn't offered", async () => {
    const found = await discoverCalendar(
      "a@example.org",
      deps({ resolveSrv: async () => [{ name: ".", port: 0, priority: 0, weight: 0 }] })
    );
    expect(found).toEqual({ kind: "unknown" });
  });

  it("finds a server that answers on /.well-known/caldav, and not a plain website", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(await discoverCalendar("a@example.org", deps({ fetch: fetchMock }))).toEqual({
      kind: "caldav",
      serverUrl: "https://caldav.example.org",
      via: "well-known",
    });
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      "https://example.org/.well-known/caldav"
    );
  });

  it("probes nothing the public-host guard refuses", async () => {
    const fetchMock = jest.fn();
    const found = await discoverCalendar(
      "a@example.org",
      deps({
        fetch: fetchMock,
        assertPublic: async () => {
          throw new Error("private");
        },
      })
    );
    expect(found).toEqual({ kind: "unknown" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an internal or malformed domain before looking anything up", async () => {
    const d = deps({ resolveMx: jest.fn() });
    expect(await discoverCalendar("a@printer.local", d)).toEqual({ kind: "unknown" });
    expect(await discoverCalendar("a@localhost", d)).toEqual({ kind: "unknown" });
    expect(d.resolveMx).not.toHaveBeenCalled();
    expect(emailDomain("nope")).toBeNull();
    expect(emailDomain("A@Example.ORG.")).toBe("example.org");
  });
});
