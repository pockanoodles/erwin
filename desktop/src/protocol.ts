/**
 * Messages between the Electron main process and the runtime utility process.
 *
 * Everything sensitive (the session signing key, the credential key, the boot
 * token) travels here, over the private parent port, rather than through argv
 * or the spawn environment, both of which other processes can read with `ps`.
 */

export interface RuntimeInit {
  type: "init";
  /** PGlite data directory, inside the app's user data. */
  dataDir: string;
  /** The staged Next standalone server (contains server.js). */
  serverDir: string;
  /** prisma/migrations, applied in order on every start. */
  migrationsDir: string;
  /** Where the database socket goes on macOS and Linux. Null means TCP. */
  socketDir: string | null;
  /** Preferred port for the app server; 0 picks a free one. */
  port: number;
  secrets: {
    nextauthSecret: string;
    erwinSecretKey: string;
    bootToken: string;
  };
  /** Read from the OS, so the first-run user matches this machine. */
  machine: {
    userName: string;
    timeZone: string;
    hourCycle: string;
    firstDay: string;
  };
  appVersion: string;
}

export interface RuntimeShutdown {
  type: "shutdown";
}

export type MainToRuntime = RuntimeInit | RuntimeShutdown;

export type RuntimeToMain =
  | { type: "progress"; step: "database" | "migrations" | "server" }
  | { type: "ready"; port: number }
  | { type: "failed"; message: string }
  | { type: "stopped" };
