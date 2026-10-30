import { NextRequest } from "next/server";

import { GET } from "@/app/api/calendar/outlook/route";
import { oauthApp } from "@/lib/oauth/apps";
import { claimOAuth } from "@/lib/oauth/requests";
import { TokenManager } from "@/lib/token-manager";

jest.mock("@/lib/oauth/requests", () => ({ claimOAuth: jest.fn() }));
jest.mock("@/lib/oauth/apps", () => ({
  oauthApp: jest.fn(),
  microsoftEndpoints: () => ({ token: "https://login.example/token" }),
}));
jest.mock("@/lib/outlook-calendar", () => ({
  OutlookCalendarService: jest.fn().mockImplementation(() => ({
    // A personal Microsoft account: no `mail`, the address is the UPN.
    getUserProfile: async () => ({ id: "1", mail: null, userPrincipalName: "me@outlook.com" }),
  })),
}));
jest.mock("@/lib/token-manager", () => {
  const storeTokens = jest.fn().mockResolvedValue("acc-1");
  return { TokenManager: { getInstance: () => ({ storeTokens }) } };
});

const callback = (query: string) =>
  new NextRequest(`http://localhost:41739/api/calendar/outlook?${query}`);

describe("Outlook sign-in callback", () => {
  const fetchMock = jest.fn();
  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.NEXTAUTH_URL = "http://localhost:41739";
    process.env.SIGWALD_RUNTIME = "desktop";
  });
  afterAll(() => {
    delete process.env.SIGWALD_RUNTIME;
  });
  beforeEach(() => jest.clearAllMocks());

  it("does nothing for a state it didn't start", async () => {
    jest.mocked(claimOAuth).mockResolvedValue(null);
    const response = await GET(callback("code=c&state=forged"));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redeems the code with the stored verifier and no secret, for the user who started it", async () => {
    jest.mocked(claimOAuth).mockResolvedValue({
      provider: "OUTLOOK",
      app: "sigwald",
      codeVerifier: "verifier",
      redirectUri: "http://localhost:41739/api/calendar/outlook",
      userId: "user-1",
    });
    jest.mocked(oauthApp).mockResolvedValue({
      kind: "sigwald",
      provider: "OUTLOOK",
      clientId: "public",
      tenantId: "common",
      redirectUri: "http://localhost:41739/api/calendar/outlook",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "a", refresh_token: "r", expires_in: 3600 }),
    });

    const response = await GET(callback("code=c&state=s"));

    expect(response.status).toBe(200);
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get("code_verifier")).toBe("verifier");
    expect(body.get("client_secret")).toBeNull();
    expect(body.get("redirect_uri")).toBe("http://localhost:41739/api/calendar/outlook");
    expect(TokenManager.getInstance().storeTokens).toHaveBeenCalledWith(
      "OUTLOOK",
      "me@outlook.com",
      expect.objectContaining({ accessToken: "a", refreshToken: "r" }),
      "user-1",
      "sigwald"
    );
  });
});
