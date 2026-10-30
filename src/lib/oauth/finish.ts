import { NextResponse } from "next/server";

import type { OAuthProvider } from "./apps";

const NAMES: Record<OAuthProvider, string> = {
  GOOGLE: "Google",
  OUTLOOK: "Microsoft",
};

const PAGE_STYLE =
  "font-family:system-ui,sans-serif;max-width:28rem;margin:20vh auto;padding:0 16px;line-height:1.5;color-scheme:light dark";

/**
 * Where a callback sends the user once it's done.
 *
 * On a server, back to Settings (claimCallback made sure this browser is
 * signed in as the user who started it). The desktop app
 * finishes sign-in in the system browser, which isn't signed in, so there it
 * says so and leaves the user to switch back: the app's Accounts list refreshes
 * when its window gets focus. `failure` is a fixed sentence, never echoed input.
 */
export function finishOAuth(
  provider: OAuthProvider,
  outcome: { ok: true } | { ok: false; code: string; failure: string }
): NextResponse {
  if (process.env.SIGWALD_RUNTIME !== "desktop") {
    const query = outcome.ok
      ? `connected=${provider.toLowerCase()}`
      : `error=${outcome.code}`;
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?${query}`
    );
  }
  const name = NAMES[provider];
  const title = outcome.ok ? `${name} is connected` : `${name} didn't connect`;
  const body = outcome.ok
    ? "You can close this tab and go back to Sigwald. Your calendars are on the Accounts list."
    : `${outcome.failure} Go back to Sigwald and try again from Settings, Accounts.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="${PAGE_STYLE}"><h1 style="font-size:1.25rem">${title}</h1><p>${body}</p></body></html>`;
  return new NextResponse(html, {
    status: outcome.ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
