"use client";

import { useCallback, useEffect, useState } from "react";

import { format } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import type { DesktopBackup, DesktopBackupKind } from "@/lib/desktop/backups";

import { useResource } from "@/hooks/use-resource";

import type { IntegrationStatus } from "./AccountManager";
import { SettingRow, SettingsSection } from "./SettingsSection";

interface BackupsState {
  available: boolean;
  dir?: string;
  backups?: DesktopBackup[];
}

const KIND_LABEL: Record<DesktopBackupKind, string> = {
  daily: "Daily",
  before: "Before an update",
  manual: "By hand",
};

/** Rows shown before "Show all"; every kept copy stays one click away. */
const SHOWN = 12;

function size(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The desktop app's backups (desktop/src/runtime.ts makes them). Renders
 * nothing on a self-hosted server, where backing up the database is the
 * host's job, and a note under dev:local, which runs the desktop runtime
 * without the app that keeps backups.
 */
export function BackupSettings() {
  const desktop =
    useResource<IntegrationStatus>("/api/integration-status").data?.desktop ??
    false;
  const [state, setState] = useState<BackupsState | null>(null);
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/desktop/backups");
      if (!response.ok) throw new Error(String(response.status));
      setState((await response.json()) as BackupsState);
    } catch {
      setState({ available: false });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const backUpNow = async () => {
    setWorking(true);
    try {
      const response = await fetch("/api/desktop/backups", { method: "POST" });
      if (!response.ok) throw new Error("The backup failed");
      const data = (await response.json()) as { backups: DesktopBackup[] };
      setState((current) => ({ ...current, available: true, backups: data.backups }));
      toast.success("Backed up");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The backup failed");
    } finally {
      setWorking(false);
    }
  };

  const restore = async (name: string) => {
    setWorking(true);
    try {
      const response = await fetch("/api/desktop/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "The restore failed");
      }
      // The app restarts into the copy a moment from now and shows its boot
      // screen, so this page has nothing more to do.
      setRestarting(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The restore failed");
      setWorking(false);
    }
  };

  if (state && !state.available && desktop) {
    return (
      <SettingsSection
        title="Backups"
        description="Backups come with the desktop app. npm run dev:local keeps its database in the .local folder of the checkout, so copying that folder is the backup."
      >
        {null}
      </SettingsSection>
    );
  }
  if (!state?.available) return null;
  const backups = state.backups ?? [];
  const newest = backups[0];

  return (
    <SettingsSection
      title="Backups"
      description="Erwin keeps copies of everything in it: one a day while it's open, one before any update that changes the database, and one whenever you ask. They sit on this computer, which Help, Show backups opens. Copy that folder to another drive or a cloud folder now and then, so a lost disk doesn't take them too."
    >
      <SettingRow
        label="Back up now"
        description={
          newest
            ? `Newest copy ${format(new Date(newest.createdAt), "MMM d, h:mm a")}.`
            : "No copies yet. The first daily copy comes a few minutes after Erwin opens."
        }
      >
        <Button
          variant="outline"
          onClick={() => void backUpNow()}
          disabled={working || restarting}
          className="font-mono text-[11px] uppercase tracking-[0.08em]"
        >
          {working && !confirming ? "Backing up…" : "Back up now"}
        </Button>
      </SettingRow>

      <SettingRow
        label="Restore"
        description="Erwin restarts into the copy you pick. The database it replaces stays in the data folder, so a restore deletes nothing."
      >
        {restarting ? (
          <p className="text-[13px] text-muted-foreground" role="status">
            Restarting into that copy…
          </p>
        ) : backups.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nothing to restore yet.</p>
        ) : (
          <ul className="border-t border-border">
            {(showAll ? backups : backups.slice(0, SHOWN)).map((backup) => (
              <li
                key={backup.name}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {format(new Date(backup.createdAt), "EEE, MMM d · h:mm a")}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {KIND_LABEL[backup.kind]} · {size(backup.bytes)}
                  </p>
                </div>
                {confirming === backup.name ? (
                  <div className="flex flex-none items-center gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void restore(backup.name)}
                      disabled={working}
                      className="font-mono text-[11px] uppercase tracking-[0.08em]"
                    >
                      Restart into it
                    </Button>
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => setConfirming(null)}
                      disabled={working}
                      className="font-mono text-[11px] uppercase tracking-[0.08em]"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirming(backup.name)}
                    disabled={working}
                    className="flex-none font-mono text-[11px] uppercase tracking-[0.08em]"
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
            {!showAll && backups.length > SHOWN ? (
              <li className="py-2">
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => setShowAll(true)}
                  className="font-mono text-[11px] uppercase tracking-[0.08em]"
                >
                  Show all {backups.length}
                </Button>
              </li>
            ) : null}
          </ul>
        )}
      </SettingRow>
    </SettingsSection>
  );
}
