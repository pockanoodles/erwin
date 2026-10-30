import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { appForNewConnection, microsoftEndpoints } from "@/lib/oauth/apps";
import { newCodeVerifier, startOAuth } from "@/lib/oauth/requests";
import { MICROSOFT_GRAPH_SCOPES } from "@/lib/outlook";

const LOG_SOURCE = "OutlookCalendarAuth";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) {
    return auth.response;
  }

  const app = await appForNewConnection("OUTLOOK");
  if (!app) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?error=outlook-not-available`
    );
  }

  const { state, codeChallenge } = await startOAuth({
    provider: "OUTLOOK",
    app: app.kind,
    codeVerifier: newCodeVerifier(),
    redirectUri: app.redirectUri,
    userId: auth.userId,
  });

  const params = new URLSearchParams({
    client_id: app.clientId,
    response_type: "code",
    redirect_uri: app.redirectUri,
    scope: MICROSOFT_GRAPH_SCOPES.join(" "),
    response_mode: "query",
    // Consent shows by itself the first time; after that, only the account
    // picker, so a reconnect is one click.
    prompt: "select_account",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return NextResponse.redirect(
    `${microsoftEndpoints(app.tenantId).auth}?${params.toString()}`
  );
}
