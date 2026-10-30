import { NextRequest } from "next/server";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { microsoftEndpoints, oauthApp } from "@/lib/oauth/apps";
import { finishOAuth } from "@/lib/oauth/finish";
import { claimOAuth } from "@/lib/oauth/requests";
import { OutlookCalendarService } from "@/lib/outlook-calendar";
import { TokenManager } from "@/lib/token-manager";

const LOG_SOURCE = "OutlookCalendarAPI";

// The Microsoft sign-in callback. The user comes from the sign-in's `state`,
// not the session: in the desktop app this request arrives in the system
// browser, which isn't signed in to Sigwald.
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const pending = await claimOAuth(searchParams.get("state"), "OUTLOOK");
  if (!pending) {
    return finishOAuth("OUTLOOK", {
      ok: false,
      code: "outlook-auth-expired",
      failure: "This sign-in link expired or was already used.",
    });
  }

  const code = searchParams.get("code");
  if (searchParams.get("error") || !code) {
    logger.error(
      "Outlook auth error:",
      { error: searchParams.get("error") ?? "no code" },
      LOG_SOURCE
    );
    return finishOAuth("OUTLOOK", {
      ok: false,
      code: "outlook-auth-declined",
      failure: "Microsoft didn't give Sigwald access.",
    });
  }

  try {
    const app = await oauthApp("OUTLOOK", pending.app);
    if (!app) throw new Error(`The ${pending.app} Outlook app isn't set up`);

    // Exchange code for tokens, on the exact redirect the sign-in left with.
    // Sigwald's own app is a public client and sends no secret.
    const params = new URLSearchParams({
      client_id: app.clientId,
      code,
      redirect_uri: pending.redirectUri,
      grant_type: "authorization_code",
      code_verifier: pending.codeVerifier,
    });
    if (app.clientSecret) params.set("client_secret", app.clientSecret);

    const tokenResponse = await fetch(microsoftEndpoints(app.tenantId).token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      logger.error(
        "Failed to exchange code for tokens",
        { status: tokenResponse.status },
        LOG_SOURCE
      );
      return finishOAuth("OUTLOOK", {
        ok: false,
        code: "token-exchange-failed",
        failure: "Microsoft refused the sign-in.",
      });
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = newDate(Date.now() + tokenData.expires_in * 1000);

    // Create a temporary account to get user info
    const outlookService = new OutlookCalendarService({
      id: "temp",
      provider: "OUTLOOK",
      email: "",
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
      createdAt: newDate(),
      updatedAt: newDate(),
      caldavUrl: null,
      caldavUsername: null,
      oauthApp: app.kind,
      userId: pending.userId,
    });
    const userProfile = await outlookService.getUserProfile();
    // A personal Microsoft account often has no `mail`; its sign-in name is
    // the address.
    const email = userProfile?.mail || userProfile?.userPrincipalName;
    if (!email) {
      logger.error(
        "Failed to get user profile",
        { profile: userProfile?.id ?? "unknown" },
        LOG_SOURCE
      );
      return finishOAuth("OUTLOOK", {
        ok: false,
        code: "profile-fetch-failed",
        failure: "Microsoft didn't share the account's email address.",
      });
    }

    await TokenManager.getInstance().storeTokens(
      "OUTLOOK",
      email,
      {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
      },
      pending.userId,
      app.kind
    );

    return finishOAuth("OUTLOOK", { ok: true });
  } catch (error) {
    logger.error(
      "Failed to connect Outlook account",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return finishOAuth("OUTLOOK", {
      ok: false,
      code: "callback-failed",
      failure: "Sigwald couldn't finish signing in to Microsoft.",
    });
  }
}
