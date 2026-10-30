import { googleClientForApp } from "@/lib/google";
import { type OAuthAppKind, microsoftEndpoints, oauthApp } from "@/lib/oauth/apps";
import { prisma } from "@/lib/prisma";

import { newDate } from "./date-utils";

export type Provider = "GOOGLE" | "OUTLOOK" | "CALDAV";

interface TokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  /** The sign-in app behind these tokens; see ConnectedAccount.oauthApp. */
  oauthApp: OAuthAppKind;
}

function appOf(account: { oauthApp: string | null }): OAuthAppKind {
  return account.oauthApp === "sigwald" ? "sigwald" : "custom";
}

export class TokenManager {
  private static instance: TokenManager;
  private constructor() {}

  public static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  async getTokens(
    accountId: string,
    userId: string
  ): Promise<TokenInfo | null> {
    const account = await prisma.connectedAccount.findUnique({
      where: { id: accountId, userId },
    });

    if (!account) {
      return null;
    }

    return {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken || undefined,
      expiresAt: account.expiresAt,
      oauthApp: appOf(account),
    };
  }

  async refreshGoogleTokens(
    accountId: string,
    userId: string
  ): Promise<TokenInfo | null> {
    const account = await prisma.connectedAccount.findUnique({
      where: { id: accountId, userId },
    });

    if (!account || !account.refreshToken) {
      return null;
    }

    try {
      const oauth2Client = await googleClientForApp(appOf(account));
      oauth2Client.setCredentials({
        refresh_token: account.refreshToken,
      });
      const response = await oauth2Client.refreshAccessToken();
      // expiry_date is an absolute epoch-ms timestamp, not a duration.
      const expiresAt = newDate(
        response.credentials.expiry_date || Date.now() + 3600 * 1000
      );

      // Update tokens in database
      const updatedAccount = await prisma.connectedAccount.update({
        where: { id: accountId, userId },
        data: {
          accessToken: response.credentials.access_token!,
          refreshToken:
            response.credentials.refresh_token || account.refreshToken,
          expiresAt,
        },
      });

      return {
        accessToken: updatedAccount.accessToken,
        refreshToken: updatedAccount.refreshToken || undefined,
        expiresAt: updatedAccount.expiresAt,
        oauthApp: appOf(updatedAccount),
      };
    } catch (error) {
      console.error("Failed to refresh Google tokens:", error);
      return null;
    }
  }

  async storeTokens(
    provider: Provider,
    email: string,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresAt: Date;
    },
    userId: string,
    app: OAuthAppKind
  ): Promise<string> {
    const account = await prisma.connectedAccount.upsert({
      where: {
        userId_provider_email: {
          userId,
          provider,
          email,
        },
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        oauthApp: app,
      },
      create: {
        provider,
        email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        oauthApp: app,
        userId,
      },
    });

    return account.id;
  }

  async refreshOutlookTokens(
    accountId: string,
    userId: string
  ): Promise<TokenInfo | null> {
    const account = await prisma.connectedAccount.findUnique({
      where: { id: accountId, userId },
    });

    if (!account || !account.refreshToken) {
      return null;
    }

    // Only the app that issued a refresh token can redeem it. Sigwald's own
    // is a public client, so it sends no secret.
    const app = await oauthApp("OUTLOOK", appOf(account));
    if (!app) {
      console.error(
        `The Outlook sign-in app this account used (${appOf(account)}) isn't set up here anymore`
      );
      return null;
    }
    const params = new URLSearchParams({
      client_id: app.clientId,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    });
    if (app.clientSecret) params.set("client_secret", app.clientSecret);

    try {
      const response = await fetch(microsoftEndpoints(app.tenantId).token, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const data = await response.json();
      const expiresAt = newDate(Date.now() + data.expires_in * 1000);

      // Update tokens in database
      const updatedAccount = await prisma.connectedAccount.update({
        where: { id: accountId, userId },
        data: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || account.refreshToken,
          expiresAt,
        },
      });

      return {
        accessToken: updatedAccount.accessToken,
        refreshToken: updatedAccount.refreshToken || undefined,
        expiresAt: updatedAccount.expiresAt,
        oauthApp: appOf(updatedAccount),
      };
    } catch (error) {
      console.error("Failed to refresh Outlook tokens:", error);
      return null;
    }
  }

  // For CalDAV, we don't need to refresh tokens as we store the password directly
  // This method is provided for consistency with other providers
  async refreshCalDAVTokens(
    accountId: string,
    userId: string
  ): Promise<TokenInfo | null> {
    const account = await prisma.connectedAccount.findUnique({
      where: { id: accountId, userId },
    });

    if (!account) {
      return null;
    }

    // For CalDAV, we just return the existing tokens
    return {
      accessToken: account.accessToken,
      expiresAt: account.expiresAt,
      oauthApp: appOf(account),
    };
  }
}
