import { timingSafeEqual } from "node:crypto";

import { encode } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

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
 * does not show up in `ps`. The server listens on the loopback interface only.
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

  // Relative to the origin the shell loads, not to request.url, which Next's
  // standalone server reports on a host of its own choosing.
  const response = NextResponse.redirect(
    new URL(
      safeNext(request.nextUrl.searchParams.get("next")),
      process.env.NEXTAUTH_URL || request.url
    )
  );
  response.cookies.set("next-auth.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

function tokensMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Only same-origin paths; anything else lands on the home route. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
}
