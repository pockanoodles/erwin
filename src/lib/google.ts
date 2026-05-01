import { getGoogleCredentials } from "./auth";

/**
 * Creates a Google OAuth2 client.
 * Loads `googleapis` lazily so importing this module does not execute the
 * `googleapis` dependency graph at build time / in environments where it can
 * throw (e.g. certain Node + bundler combinations).
 */
export async function createGoogleOAuthClient(options?: {
  redirectUrl?: string;
}) {
  const { google } = await import("googleapis");
  const credentials = await getGoogleCredentials();
  return new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    options?.redirectUrl
  );
}
