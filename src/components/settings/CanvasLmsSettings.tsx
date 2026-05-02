"use client";

import { useCallback, useEffect, useState } from "react";

import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { logger } from "@/lib/logger";

import { SettingsSection } from "./SettingsSection";

const LOG_SOURCE = "CanvasLmsSettings";

interface CanvasStatus {
  configured: boolean;
  provider: {
    id: string;
    name: string;
    serverUrl: string | null;
    lastSyncedAt: string | null;
    error: string | null;
    syncIntervalMinutes: number | null;
  } | null;
}

/**
 * Erwin: configure Canvas LMS (personal access token) and trigger sync.
 */
export function CanvasLmsSettings() {
  const [baseUrl, setBaseUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [displayName, setDisplayName] = useState("Canvas LMS");
  const [status, setStatus] = useState<CanvasStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/erwin/canvas");
      if (!res.ok) {
        throw new Error("Failed to load Canvas status");
      }
      const data = (await res.json()) as CanvasStatus;
      setStatus(data);
      if (data.provider?.serverUrl) {
        setBaseUrl(data.provider.serverUrl);
      }
      if (data.provider?.name) {
        setDisplayName(data.provider.name);
      }
    } catch (e) {
      logger.error(
        "Canvas settings load failed",
        { error: e instanceof Error ? e.message : "Unknown" },
        LOG_SOURCE
      );
      toast.error("Could not load Canvas settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runValidate = async () => {
    setBusy("validate");
    try {
      const res = await fetch("/api/erwin/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validate",
          baseUrl,
          accessToken,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Validation failed");
      }
      toast.success("Canvas token is valid");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setBusy(null);
    }
  };

  const runSave = async () => {
    setBusy("save");
    try {
      const res = await fetch("/api/erwin/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          baseUrl,
          accessToken,
          name: displayName,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Save failed");
      }
      toast.success("Canvas settings saved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const runSync = async () => {
    setBusy("sync");
    try {
      const res = await fetch("/api/erwin/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync",
          ...(accessToken && baseUrl
            ? { baseUrl, accessToken, name: displayName }
            : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { error?: string }).error ?? "Sync failed");
      }
      toast.success(
        `Synced ${(j as { upserted?: number }).upserted ?? 0} assignment rows`
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSection
      title="Canvas LMS (Erwin)"
      description="Read-only sync from Canvas into Erwin tasks. Use a personal access token from your Canvas account settings."
    >
      <Card>
        <CardHeader>
          <CardTitle>Canvas connection</CardTitle>
          <CardDescription>
            Assignments from active courses are imported as tasks. Nothing is written back to
            Canvas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading status...
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Status:{" "}
              {status?.configured ? (
                <span className="font-medium text-foreground">configured</span>
              ) : (
                <span className="font-medium text-foreground">not configured</span>
              )}
              {status?.provider?.lastSyncedAt
                ? ` · Last sync: ${new Date(status.provider.lastSyncedAt).toLocaleString()}`
                : null}
            </p>
          )}

          <div className="grid gap-2">
            <Label htmlFor="canvas-base-url">Canvas base URL</Label>
            <Input
              id="canvas-base-url"
              placeholder="https://your-school.instructure.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="canvas-token">Personal access token</Label>
            <Input
              id="canvas-token"
              type="password"
              placeholder="Paste token (stored server-side)"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="canvas-display-name">Label</Label>
            <Input
              id="canvas-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busy) || !baseUrl || !accessToken}
              onClick={() => void runValidate()}
            >
              {busy === "validate" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Test token
            </Button>
            <Button
              type="button"
              disabled={Boolean(busy) || !baseUrl || !accessToken}
              onClick={() => void runSave()}
            >
              {busy === "save" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(busy) || (!status?.configured && (!baseUrl || !accessToken))}
              onClick={() => void runSync()}
            >
              {busy === "sync" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync now
            </Button>
          </div>
        </CardContent>
      </Card>
    </SettingsSection>
  );
}
