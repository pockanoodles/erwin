import { getGoogleCredentials, getOutlookCredentials } from "@/lib/auth";

import { SIGWALD_OAUTH_APPS } from "./sigwald-apps";

export type OAuthProvider = "GOOGLE" | "OUTLOOK";

/**
 * Which app an account signed in through. `sigwald` is the app Sigwald ships
 * (see sigwald-apps.ts); `custom` is the one an admin entered under System or
 * in the environment. A token can only be refreshed by the app that issued it,
 * so every account remembers its app.
 */
export type OAuthAppKind = "sigwald" | "custom";

export interface OAuthApp {
  kind: OAuthAppKind;
  provider: OAuthProvider;
  clientId: string;
  /** Absent for Microsoft's public client, which has none. */
  clientSecret?: string;
  /** Microsoft only: the directory sign-in goes through. */
  tenantId: string;
  redirectUri: string;
}

const CALLBACK_PATH: Record<OAuthProvider, string> = {
  GOOGLE: "/api/calendar/google",
  OUTLOOK: "/api/calendar/outlook",
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function appOrigin(): URL | null {
  try {
    return process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL) : null;
  } catch {
    return null;
  }
}

/** True when Sigwald serves from the user's own machine. */
export function servesFromLoopback(): boolean {
  const origin = appOrigin();
  return !!origin && LOOPBACK_HOSTS.has(origin.hostname);
}

/**
 * The loopback redirect for Sigwald's own apps. Google's Desktop client wants
 * the IP; Microsoft registers loopback redirects as `localhost`. Both accept
 * any port, which matters because the desktop app picks its port at launch.
 */
function loopbackRedirect(provider: OAuthProvider): string {
  const port = appOrigin()?.port;
  const host = provider === "GOOGLE" ? "127.0.0.1" : "localhost";
  return `http://${host}${port ? `:${port}` : ""}${CALLBACK_PATH[provider]}`;
}

async function customApp(provider: OAuthProvider): Promise<OAuthApp | null> {
  const redirectUri = `${process.env.NEXTAUTH_URL}${CALLBACK_PATH[provider]}`;
  if (provider === "GOOGLE") {
    const { clientId, clientSecret } = await getGoogleCredentials();
    if (!clientId || !clientSecret) return null;
    return { kind: "custom", provider, clientId, clientSecret, tenantId: "common", redirectUri };
  }
  const { clientId, clientSecret, tenantId } = await getOutlookCredentials();
  if (!clientId || !clientSecret) return null;
  return {
    kind: "custom",
    provider,
    clientId,
    clientSecret,
    tenantId: tenantId || "common",
    redirectUri,
  };
}

function sigwaldApp(provider: OAuthProvider): OAuthApp | null {
  if (!servesFromLoopback()) return null;
  const redirectUri = loopbackRedirect(provider);
  if (provider === "GOOGLE") {
    const { clientId, clientSecret } = SIGWALD_OAUTH_APPS.google;
    if (!clientId) return null;
    return { kind: "sigwald", provider, clientId, clientSecret, tenantId: "common", redirectUri };
  }
  const { clientId } = SIGWALD_OAUTH_APPS.microsoft;
  if (!clientId) return null;
  return { kind: "sigwald", provider, clientId, tenantId: "common", redirectUri };
}

/** The app of that kind, or null when it isn't set up here. */
export async function oauthApp(
  provider: OAuthProvider,
  kind: OAuthAppKind
): Promise<OAuthApp | null> {
  return kind === "custom" ? customApp(provider) : sigwaldApp(provider);
}

/**
 * The app a new connection signs in through. An admin's own app wins, since
 * entering one is a deliberate choice; otherwise Sigwald's, where it can work.
 */
export async function appForNewConnection(
  provider: OAuthProvider
): Promise<OAuthApp | null> {
  return (await customApp(provider)) ?? sigwaldApp(provider);
}

/** Microsoft's sign-in endpoints for a directory (`common` for any account). */
export function microsoftEndpoints(tenantId: string) {
  const base = `https://login.microsoftonline.com/${encodeURIComponent(tenantId || "common")}/oauth2/v2.0`;
  return { auth: `${base}/authorize`, token: `${base}/token` };
}
