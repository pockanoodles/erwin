/**
 * The browser stand-in for `./server`, substituted by the client-build alias in
 * `next.config.js`.
 *
 * `@/lib/logger` is a universal facade: 111 modules import it, server routes
 * and client components alike, and it picks an implementation at runtime. The
 * runtime check is correct but invisible to the bundler, so the static import
 * of `./server` dragged `@/lib/prisma` — and with it the Prisma client and the
 * credential-encryption extension — into every client chunk that touched a
 * store or a logged component. Prisma's browser build then threw at module
 * scope, which surfaced as "Application error: a client-side exception has
 * occurred" on every page.
 *
 * Swapping this file in cuts that edge without renaming an import in any of
 * those 111 files, which on a fork would be 111 files of future merge conflict.
 *
 * Constructing it is a bug rather than a fallback: the facade only reaches for
 * the server logger when `window` is undefined, so if this ever runs, the
 * environment check above it is wrong and silence would hide that.
 */
export class ServerLogger {
  constructor() {
    throw new Error(
      "ServerLogger was constructed in the browser. Logs from client code go " +
        "through ClientLogger and the /api/logs/batch route."
    );
  }
}
