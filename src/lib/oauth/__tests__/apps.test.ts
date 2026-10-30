import { getGoogleCredentials, getOutlookCredentials } from "@/lib/auth";

import { appForNewConnection, microsoftEndpoints, oauthApp } from "../apps";

jest.mock("@/lib/auth", () => ({
  getGoogleCredentials: jest.fn(),
  getOutlookCredentials: jest.fn(),
}));
jest.mock("../sigwald-apps", () => ({
  SIGWALD_OAUTH_APPS: {
    google: { clientId: "sigwald-google", clientSecret: "installed-app" },
    microsoft: { clientId: "sigwald-microsoft" },
  },
}));

const noCustom = () => {
  jest.mocked(getGoogleCredentials).mockResolvedValue({ clientId: "", clientSecret: "" });
  jest.mocked(getOutlookCredentials).mockResolvedValue({ clientId: "", clientSecret: "", tenantId: "" });
};

describe("OAuth app choice", () => {
  const originalUrl = process.env.NEXTAUTH_URL;
  afterEach(() => {
    process.env.NEXTAUTH_URL = originalUrl;
  });

  it("uses Sigwald's own apps on a loopback origin, on loopback redirects with the app's port", async () => {
    process.env.NEXTAUTH_URL = "http://localhost:41739";
    noCustom();
    const google = await appForNewConnection("GOOGLE");
    const outlook = await appForNewConnection("OUTLOOK");
    expect(google).toMatchObject({
      kind: "sigwald",
      clientId: "sigwald-google",
      redirectUri: "http://127.0.0.1:41739/api/calendar/google",
    });
    expect(outlook).toMatchObject({
      kind: "sigwald",
      clientId: "sigwald-microsoft",
      redirectUri: "http://localhost:41739/api/calendar/outlook",
    });
    expect(outlook?.clientSecret).toBeUndefined();
  });

  it("has no app for a server at its own domain without a custom one", async () => {
    process.env.NEXTAUTH_URL = "https://sigwald.example.org";
    noCustom();
    expect(await appForNewConnection("GOOGLE")).toBeNull();
    expect(await appForNewConnection("OUTLOOK")).toBeNull();
  });

  it("prefers an admin's custom app, and Outlook's tenant is optional", async () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    jest.mocked(getGoogleCredentials).mockResolvedValue({ clientId: "mine", clientSecret: "shh" });
    jest.mocked(getOutlookCredentials).mockResolvedValue({ clientId: "ms", clientSecret: "shh", tenantId: "" });
    expect(await appForNewConnection("GOOGLE")).toMatchObject({
      kind: "custom",
      clientId: "mine",
      redirectUri: "http://localhost:3000/api/calendar/google",
    });
    expect(await appForNewConnection("OUTLOOK")).toMatchObject({ kind: "custom", tenantId: "common" });
  });

  it("still finds Sigwald's app for an account that used it after a custom one was added", async () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    jest.mocked(getGoogleCredentials).mockResolvedValue({ clientId: "mine", clientSecret: "shh" });
    expect(await oauthApp("GOOGLE", "sigwald")).toMatchObject({ clientId: "sigwald-google" });
  });

  it("builds Microsoft endpoints for a tenant", () => {
    expect(microsoftEndpoints("").token).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    );
    expect(microsoftEndpoints("contoso.onmicrosoft.com").auth).toBe(
      "https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/authorize"
    );
  });
});
