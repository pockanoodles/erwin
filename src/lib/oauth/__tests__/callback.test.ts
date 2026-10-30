import { NextRequest } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";

import { claimCallback } from "../callback";
import { claimOAuth } from "../requests";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("../requests", () => ({ claimOAuth: jest.fn() }));

const pending = {
  provider: "GOOGLE" as const,
  app: "sigwald" as const,
  codeVerifier: "v",
  redirectUri: "http://127.0.0.1:3000/api/calendar/google",
  userId: "alice",
};

// What a browser sends: the Host header names the address it actually used.
const at = (url: string) =>
  new NextRequest(url, { headers: { host: new URL(url).host } });

describe("claimCallback on a server", () => {
  beforeAll(() => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    delete process.env.SIGWALD_RUNTIME;
  });
  beforeEach(() => jest.clearAllMocks());

  it("forwards Google's 127.0.0.1 return to the app's origin before claiming", async () => {
    const result = await claimCallback(
      at("http://127.0.0.1:3000/api/calendar/google?code=c&state=s"),
      "GOOGLE",
      "test"
    );
    expect("response" in result && result.response.headers.get("location")).toBe(
      "http://localhost:3000/api/calendar/google?code=c&state=s"
    );
    expect(claimOAuth).not.toHaveBeenCalled();
  });

  it("doesn't forward behind a proxy that sends Host 127.0.0.1 to a public origin", async () => {
    process.env.NEXTAUTH_URL = "https://calendar.example.org";
    jest.mocked(authenticateRequest).mockResolvedValue({ userId: "alice" } as never);
    jest.mocked(claimOAuth).mockResolvedValue(pending);
    const result = await claimCallback(
      at("http://127.0.0.1:3000/api/calendar/google?code=c&state=s"),
      "GOOGLE",
      "test"
    );
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    expect(result).toEqual({ pending });
  });

  it("refuses a browser that isn't signed in", async () => {
    jest.mocked(authenticateRequest).mockResolvedValue({ response: new Response() } as never);
    const result = await claimCallback(
      at("http://localhost:3000/api/calendar/google?code=c&state=s"),
      "GOOGLE",
      "test"
    );
    expect("response" in result && result.response.headers.get("location")).toContain(
      "error=oauth-signed-out"
    );
    expect(claimOAuth).not.toHaveBeenCalled();
  });

  it("refuses a sign-in another user started, so their link can't take your calendar", async () => {
    jest.mocked(authenticateRequest).mockResolvedValue({ userId: "bob" } as never);
    jest.mocked(claimOAuth).mockResolvedValue(pending);
    const result = await claimCallback(
      at("http://localhost:3000/api/calendar/google?code=c&state=s"),
      "GOOGLE",
      "test"
    );
    expect("response" in result && result.response.headers.get("location")).toContain(
      "error=oauth-wrong-user"
    );
  });

  it("hands the sign-in to the user who started it", async () => {
    jest.mocked(authenticateRequest).mockResolvedValue({ userId: "alice" } as never);
    jest.mocked(claimOAuth).mockResolvedValue(pending);
    const result = await claimCallback(
      at("http://localhost:3000/api/calendar/google?code=c&state=s"),
      "GOOGLE",
      "test"
    );
    expect(result).toEqual({ pending });
  });
});
