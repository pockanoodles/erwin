import { NextRequest } from "next/server";

import { GET } from "@/app/api/desktop/session/route";

jest.mock("next-auth/jwt", () => ({
  encode: jest.fn().mockResolvedValue("signed-jwt-token"),
}));

jest.mock("@/lib/desktop/bootstrap", () => ({
  ensureDesktopUser: jest.fn().mockResolvedValue({
    id: "user-1",
    name: "You",
    email: "local@erwin.invalid",
    role: "admin",
  }),
}));

function request(query: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://0.0.0.0:3000/api/desktop/session?${query}`, {
    headers,
  });
}

describe("GET /api/desktop/session", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ERWIN_RUNTIME: "desktop",
      ERWIN_DESKTOP_BOOT_TOKEN: "test-boot-token",
      NEXTAUTH_SECRET: "test-secret",
      NEXTAUTH_URL: "http://localhost:3000",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("refuses a wrong boot token", async () => {
    const res = await GET(request("t=wrong"));
    expect(res.status).toBe(403);
  });

  it("redirects relative to whatever origin the phone reached", async () => {
    const res = await GET(
      request("t=test-boot-token&next=/today", {
        host: "192.168.1.42:3000",
        "x-forwarded-host": "evil.example",
      })
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/today");
    expect(res.cookies.get("next-auth.session-token")?.value).toBe(
      "signed-jwt-token"
    );
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])(
    "sends a foreign next (%s) home",
    async (next) => {
      const res = await GET(
        request(`t=test-boot-token&next=${encodeURIComponent(next)}`)
      );
      expect(res.headers.get("location")).toBe("/");
    }
  );

  it("names the cookie the way next-auth reads it behind HTTPS", async () => {
    process.env.NEXTAUTH_URL = "https://mac.tailnet.ts.net";
    const res = await GET(request("t=test-boot-token"));

    const cookie = res.cookies.get("__Secure-next-auth.session-token");
    expect(cookie?.value).toBe("signed-jwt-token");
    expect(cookie?.secure).toBe(true);
    expect(res.cookies.get("next-auth.session-token")).toBeUndefined();
  });
});
