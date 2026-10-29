import { encode } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import { timingSafeEqual } from "node:crypto";

import { ensureDesktopUser } from "@/lib/desktop/bootstrap";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "DesktopSessionAPI";

/** Same lifetime as `session.maxAge` in auth-options. */
const SESSION_MAX_AGE = 365 * 24 * 60 * 60;

export const dynamic = "force-dynamic";

/**
 * GET /api/desktop/session?t=<boot token>&next=<path>
 *
 * Signs the desktop app's one local user in. Only exists when the server runs
 * inside the Electron shell (`ERWIN_RUNTIME=desktop`); everywhere else it is a
 * 404. The shell generates a fresh random token on every launch and hands it
 * to this process over IPC, never through argv or the spawn environment, so it
 * does not show up in `ps`. The server listens on the loopback interface only;
 * `npm run dev:local -- --lan` is the one deliberate exception, for a phone.
 *
 * The session is the same next-auth JWT a password sign-in produces, so every
 * other route authenticates it the ordinary way.
 */
export async function GET(request: NextRequest) {
  if (process.env.ERWIN_RUNTIME !== "desktop") {
    return new NextResponse("Not found", { status: 404 });
  }

  const expected = process.env.ERWIN_DESKTOP_BOOT_TOKEN ?? "";
  const given = request.nextUrl.searchParams.get("t") ?? "";
  if (!expected || !tokensMatch(given, expected)) {
    logger.warn("Desktop session refused: bad boot token", {}, LOG_SOURCE);
    return new NextResponse("Forbidden", { status: 403 });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return new NextResponse("NEXTAUTH_SECRET is not set", { status: 500 });
  }

  const user = await ensureDesktopUser();
  const token = await encode({
    token: {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    secret,
    maxAge: SESSION_MAX_AGE,
  });

  // A relative Location, so the browser stays on whatever origin it reached:
  // localhost in the shell, the Mac's LAN or tailnet address from a phone.
  // Next's standalone server reports a host of its own choosing in
  // request.url, and the Host header is the client's to set.
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: safeNext(request.nextUrl.searchParams.get("next")) },
  });
  // next-auth reads the __Secure- name exactly when NEXTAUTH_URL is https
  // (behind an HTTPS proxy); a plain cookie still rides `tailscale serve`.
  const secure = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
  response.cookies.set(
    secure ? "__Secure-next-auth.session-token" : "next-auth.session-token",
    token,
    {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    }
  );
  return response;
}

function tokensMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Only same-origin paths; anything else lands on the home route. Browsers
 *  read a backslash as a slash, so `/\host` is as foreign as `//host`. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || /^\/[/\\]/.test(next)) {
    return "/";
  }
  return next;
}
