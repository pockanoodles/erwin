import { type OAuthApp, type OAuthAppKind, oauthApp } from "./oauth/apps";

/**
 * Creates a Google OAuth2 client for one sign-in app.
 * Loads `googleapis` lazily so importing this module does not execute the
 * `googleapis` dependency graph at build time / in environments where it can
 * throw (e.g. certain Node + bundler combinations).
 */
export async function createGoogleOAuthClient(app: OAuthApp) {
  const { google } = await import("googleapis");
  return new google.auth.OAuth2(
    app.clientId,
    app.clientSecret,
    app.redirectUri
  );
}

/** The client for an account's own app, which alone can refresh its tokens. */
export async function googleClientForApp(kind: OAuthAppKind) {
  const app = await oauthApp("GOOGLE", kind);
  if (!app) {
    throw new Error(
      `The Google sign-in app this account used (${kind}) isn't set up here anymore`
    );
  }
  return createGoogleOAuthClient(app);
}
