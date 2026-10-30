import { NextRequest } from "next/server";

import * as route from "@/app/api/calendar/google/auth/route";
import { authenticateRequest } from "@/lib/auth/api-auth";
import * as googleModule from "@/lib/google";
import { appForNewConnection } from "@/lib/oauth/apps";
import { startOAuth } from "@/lib/oauth/requests";

jest.mock("@/lib/google");
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/oauth/apps", () => ({ appForNewConnection: jest.fn() }));
jest.mock("@/lib/oauth/requests", () => ({
  newCodeVerifier: () => "verifier",
  startOAuth: jest.fn(),
}));

const request = new NextRequest("http://localhost:3000/api/calendar/google/auth");

describe("Calendar Google auth route", () => {
  beforeAll(() => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({ userId: "user-1" } as never);
    jest.mocked(startOAuth).mockResolvedValue({ state: "st", codeChallenge: "ch" });
  });

  it("leaves with tasks scope, the sign-in's state and a PKCE challenge", async () => {
    const app = {
      kind: "sigwald" as const,
      provider: "GOOGLE" as const,
      clientId: "id",
      clientSecret: "s",
      tenantId: "common",
      redirectUri: "http://127.0.0.1:41739/api/calendar/google",
    };
    jest.mocked(appForNewConnection).mockResolvedValue(app);
    const generateAuthUrl = jest.fn().mockReturnValue("https://redirect");
    jest.spyOn(googleModule, "createGoogleOAuthClient").mockResolvedValue(
      { generateAuthUrl } as unknown as Awaited<ReturnType<typeof googleModule.createGoogleOAuthClient>>
    );

    await route.GET(request);

    expect(startOAuth).toHaveBeenCalledWith({
      provider: "GOOGLE",
      app: "sigwald",
      codeVerifier: "verifier",
      redirectUri: app.redirectUri,
      userId: "user-1",
    });
    const arg = generateAuthUrl.mock.calls[0][0];
    expect(arg.scope).toContain("https://www.googleapis.com/auth/tasks");
    expect(arg.state).toBe("st");
    expect(arg.code_challenge).toBe("ch");
    expect(arg.code_challenge_method).toBe("S256");
  });

  it("sends the user back to Settings when no app is set up", async () => {
    jest.mocked(appForNewConnection).mockResolvedValue(null);
    const response = await route.GET(request);
    expect(response?.headers.get("location")).toContain("error=google-not-available");
    expect(startOAuth).not.toHaveBeenCalled();
  });
});
