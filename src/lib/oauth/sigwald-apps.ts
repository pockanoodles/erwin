/**
 * Sigwald's own sign-in apps at Google and Microsoft, so a user connects a
 * calendar with one click instead of registering an OAuth app first.
 *
 * Both are apps for software that runs on the user's machine: Google's
 * "Desktop app" client and a Microsoft public client ("Mobile and desktop
 * applications" platform). Their redirect is a loopback address, so they only
 * work where Sigwald itself is on the user's machine (the desktop app,
 * `dev:local`, a server reached at localhost). A server at its own domain
 * brings its own app under System.
 *
 * None of this is secret. Google issues a "secret" with a Desktop client but
 * says plainly that an installed app can't keep one; what protects a sign-in
 * is PKCE and the loopback redirect, not this file. Microsoft's public client
 * has no secret at all.
 *
 * An empty client ID means that app isn't registered yet, and Sigwald falls
 * back to a custom app, or shows the provider as unavailable.
 */
export const SIGWALD_OAUTH_APPS = {
  google: {
    clientId: "",
    clientSecret: "",
  },
  microsoft: {
    clientId: "",
  },
} as const;
