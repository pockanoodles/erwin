/**
 * The desktop app's backups, as the Next server sees them. The runtime
 * process (desktop/src/runtime.ts) owns the database and the backups folder,
 * and it hands this server an object on `globalThis` before it starts it, since
 * both run in the same process. Anywhere else (a self-hosted server, dev:local)
 * there is no such object, and backups are the host's job.
 */

export type DesktopBackupKind = "before" | "daily" | "manual";

export interface DesktopBackup {
  name: string;
  /** Made before a migration, once a day, or when asked. */
  kind: DesktopBackupKind;
  createdAt: string;
  bytes: number;
}

export interface DesktopBackups {
  /** The backups folder (Help, Show backups opens it). */
  dir: string;
  /** Newest first. */
  list(): DesktopBackup[];
  create(): Promise<DesktopBackup>;
  /** Marks a listed backup to load and restarts the app's runtime into it. */
  restore(name: string): void;
}

export function desktopBackups(): DesktopBackups | null {
  return (
    (globalThis as { erwinDesktopBackups?: DesktopBackups })
      .erwinDesktopBackups ?? null
  );
}
