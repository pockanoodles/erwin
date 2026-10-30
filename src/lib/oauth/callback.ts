import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";

import { type OAuthProvider, servesFromLoopback } from "./apps";
import { finishOAuth } from "./finish";
import { type PendingOAuth, claimOAuth } from "./requests";

/**
 * Who a sign-in callback is for, or the response that ends it.
 *
 * On a server, the browser that comes back has to be signed in as the user who
 * started the sign-in. `state` alone isn't enough there: someone with their own
 * account could start a sign-in, send its link to another user, and get that
 * person's calendar attached to their own account when they approve it.
 *
 * The desktop app has one local user, so nobody else can start a sign-in on
 * it, and it finishes in the system browser, which has no session. There the
 * claimed `state` is the whole check.
 */
export async function claimCallback(
  request: NextRequest,
  provider: OAuthProvider,
  logSource: string
): Promise<{ pending: PendingOAuth } | { response: NextResponse }> {
  const state = request.nextUrl.searchParams.get("state");
  if (process.env.SIGWALD_RUNTIME === "desktop") {
    const pending = await claimOAuth(state, provider);
    return pending ? { pending } : { response: expired(provider) };
  }

  // Google sends Sigwald's own app back to 127.0.0.1, which doesn't carry the
  // session cookie a browser holds for localhost. Forward to the app's own
  // origin, same path and query, before claiming anything. The Host header,
  // because Next's `nextUrl` reports 127.0.0.1 as localhost. Only where
  // Sigwald serves from loopback, which is the only place its own app works:
  // behind a reverse proxy that forwards `Host: 127.0.0.1`, forwarding to the
  // public origin would come straight back here, forever.
  const origin = new URL(process.env.NEXTAUTH_URL!);
  const host = request.headers.get("host") ?? "";
  if (
    servesFromLoopback() &&
    host.split(":")[0] === "127.0.0.1" &&
    origin.hostname !== "127.0.0.1"
  ) {
    const target = new URL(request.nextUrl.pathname, origin);
    target.search = request.nextUrl.search;
    return { response: NextResponse.redirect(target) };
  }

  const auth = await authenticateRequest(request, logSource);
  if ("response" in auth) {
    return {
      response: finishOAuth(provider, {
        ok: false,
        code: "oauth-signed-out",
        failure: "Sign in to Sigwald in this browser first.",
      }),
    };
  }
  const pending = await claimOAuth(state, provider);
  if (!pending) return { response: expired(provider) };
  if (pending.userId !== auth.userId) {
    return {
      response: finishOAuth(provider, {
        ok: false,
        code: "oauth-wrong-user",
        failure: "Another Sigwald account started this sign-in.",
      }),
    };
  }
  return { pending };
}

function expired(provider: OAuthProvider): NextResponse {
  return finishOAuth(provider, {
    ok: false,
    code: `${provider.toLowerCase()}-auth-expired`,
    failure: "This sign-in link expired or was already used.",
  });
}
