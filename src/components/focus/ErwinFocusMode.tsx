"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AlertTriangle } from "lucide-react";

import { ActionOverlay } from "@/components/ui/action-overlay";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import type { FocusBriefing } from "@/lib/erwin/briefing";
import {
  parseTaskFromApi,
  type FocusQueueTask,
} from "@/lib/erwin/parse-task";

import { useFocusModeStore } from "@/store/focusMode";
import { useTaskStore } from "@/store/task";

import { FocusedTask } from "./FocusedTask";

function getOrCreateFocusSessionId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const key = "erwin-focus-session";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

interface QueueResponse {
  ranked: Record<string, unknown>[];
  briefing: FocusBriefing;
}

/**
 * Erwin Focus: Stage 1 queue, daily briefing, Done/Skip with TaskInteraction logging.
 */
export function ErwinFocusMode() {
  const [mounted, setMounted] = useState(false);
  const [ranked, setRanked] = useState<FocusQueueTask[]>([]);
  const [briefing, setBriefing] = useState<FocusBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const surfaceLoggedRef = useRef<Set<string>>(new Set());
  const { startProcessing, stopProcessing, isProcessing, actionType, actionMessage } =
    useFocusModeStore();
  const fetchTasks = useTaskStore((s) => s.fetchTasks);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/erwin/focus/queue");
      if (!res.ok) {
        throw new Error("Failed to load focus queue");
      }
      const data = (await res.json()) as QueueResponse;
      setBriefing(data.briefing);
      setRanked(data.ranked.map((r) => parseTaskFromApi(r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    void loadQueue();
  }, [mounted, loadQueue]);

  const logInteraction = useCallback(
    async (taskId: string, action: "COMPLETED" | "SKIPPED" | "SURFACED") => {
      const sessionId = getOrCreateFocusSessionId();
      if (!sessionId) {
        return;
      }
      const tz =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined;
      const res = await fetch("/api/erwin/focus/interaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          action,
          sessionId,
          clientTimezone: tz,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Interaction failed");
      }
    },
    []
  );

  const top = ranked[0] ?? null;
  const upNext = ranked.slice(1, 3);

  useEffect(() => {
    if (!top?.id || loading) {
      return;
    }
    const key = top.id;
    if (surfaceLoggedRef.current.has(key)) {
      return;
    }
    surfaceLoggedRef.current.add(key);
    void logInteraction(key, "SURFACED").catch(() => {
      surfaceLoggedRef.current.delete(key);
    });
  }, [top?.id, loading, logInteraction]);

  const handleDone = async () => {
    if (!top) {
      return;
    }
    setActing(true);
    startProcessing("celebration", "Task completed!");
    try {
      await logInteraction(top.id, "COMPLETED");
      await fetchTasks();
      await loadQueue();
    } catch (e) {
      stopProcessing();
      startProcessing(
        "error",
        e instanceof Error ? e.message : "Could not complete task"
      );
      setTimeout(() => stopProcessing(), 2500);
    } finally {
      setActing(false);
    }
  };

  const handleSkip = async () => {
    if (!top) {
      return;
    }
    setActing(true);
    try {
      await logInteraction(top.id, "SKIPPED");
      await fetchTasks();
      await loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Skip failed");
    } finally {
      setActing(false);
    }
  };

  if (!mounted) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">Loading Focus...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {isProcessing && actionType ? (
        <ActionOverlay
          type={actionType}
          message={actionMessage || undefined}
          onComplete={stopProcessing}
          autoHideDuration={actionType === "celebration" ? 2200 : 1500}
        />
      ) : null}

      <header className="border-b border-border bg-muted/30 px-4 py-4 md:px-8">
        <h1 className="text-lg font-semibold tracking-tight">Daily briefing</h1>
        {briefing ? (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{briefing.dueTodayCount}</span> due
              today
            </span>
            <span>
              <span className="font-medium text-foreground">{briefing.dueThisWeekCount}</span> due
              in the next 7 days
            </span>
            <span>
              <span className="font-medium text-foreground">{briefing.pendingCount}</span> open
              tasks
            </span>
            {briefing.dangerCount > 0 ? (
              <span className="flex items-center gap-1 font-medium text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {briefing.dangerCount} in danger zone
              </span>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col gap-6 p-4 md:flex-row md:p-8">
        <main className="flex min-h-0 flex-1 flex-col">
          {loading ? (
            <p className="text-muted-foreground">Loading your next task...</p>
          ) : !top ? (
            <Card className="flex flex-1 flex-col items-center justify-center p-8">
              <CardContent className="text-center text-muted-foreground">
                <p className="text-lg font-medium text-foreground">All clear</p>
                <p className="mt-2">Nothing pending in your queue right now.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {top.erwin?.danger ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Danger zone</AlertTitle>
                  <AlertDescription>
                    This task is overdue or has very little time left versus its estimate. Do it
                    first.
                  </AlertDescription>
                </Alert>
              ) : null}
              <FocusedTask task={top} />
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  disabled={acting}
                  onClick={() => void handleDone()}
                  className="min-w-[120px]"
                >
                  Done
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  disabled={acting}
                  onClick={() => void handleSkip()}
                  className="min-w-[120px]"
                >
                  Skip
                </Button>
              </div>
            </>
          )}
        </main>

        <aside className="w-full shrink-0 md:w-72">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Up next</h2>
          {upNext.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other ranked tasks.</p>
          ) : (
            <ul className="space-y-3">
              {upNext.map((t, i) => (
                <li key={t.id}>
                  <Card>
                    <CardContent className="p-3 text-sm">
                      <span className="text-xs text-muted-foreground">#{i + 2}</span>
                      <p className="font-medium leading-snug">{t.title}</p>
                      {t.courseName ? (
                        <p className="mt-1 text-xs text-muted-foreground">{t.courseName}</p>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
