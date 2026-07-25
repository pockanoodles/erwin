"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { TaskStatus } from "@/types/task";
import type { BriefingData } from "@/types/focus-briefing";
import {
  parseTaskFromApi,
  type FocusQueueTask,
} from "@/lib/erwin/parse-task";

import { useTaskStore } from "@/store/task";

import { CompactBriefing } from "./CompactBriefing";
import { DailyBriefing } from "./DailyBriefing";
import { FocusTaskCard } from "./FocusTaskCard";
import { QuickAdd } from "./QuickAdd";
import { UpNext } from "./UpNext";

const STORAGE_LAST_BRIEFING = "erwin-last-briefing";
const STORAGE_FOCUS_BOOST = "erwin-focus-boost";

function localDayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface QueueResponse {
  ranked: Record<string, unknown>[];
  briefing?: Record<string, unknown>;
}

/**
 * Erwin Focus: briefing gate, queue, TaskInteraction logging (docs/focus-mode.md).
 */
export function ErwinFocusMode() {
  const [mounted, setMounted] = useState(false);
  const [ranked, setRanked] = useState<FocusQueueTask[]>([]);
  const [briefingData, setBriefingData] = useState<BriefingData | null>(null);
  const [showFullBriefing, setShowFullBriefing] = useState(false);
  const [queueLoading, setQueueLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [cardDir, setCardDir] = useState<"left" | "right" | null>(null);

  const sessionId = useRef(crypto.randomUUID());
  const surfaceLoggedRef = useRef<Set<string>>(new Set());
  const fetchTasks = useTaskStore((s) => s.fetchTasks);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/erwin/focus/queue");
      if (!res.ok) {
        throw new Error("Failed to load focus queue");
      }
      const data = (await res.json()) as QueueResponse;
      let list = data.ranked.map((r) => parseTaskFromApi(r));
      if (typeof window !== "undefined") {
        const boost = sessionStorage.getItem(STORAGE_FOCUS_BOOST);
        if (boost) {
          sessionStorage.removeItem(STORAGE_FOCUS_BOOST);
          const t = list.find((x) => x.id === boost);
          if (t) {
            list = [t, ...list.filter((x) => x.id !== boost)];
          }
        }
      }
      setRanked(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const loadBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const res = await fetch("/api/erwin/focus/briefing");
      if (!res.ok) {
        throw new Error("Failed to load briefing");
      }
      const data = (await res.json()) as BriefingData;
      setBriefingData(data);
    } catch {
      setBriefingData(null);
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const last = localStorage.getItem(STORAGE_LAST_BRIEFING);
    const today = localDayKey();
    if (last !== today) {
      setShowFullBriefing(true);
    } else {
      setShowFullBriefing(false);
    }
    void loadQueue();
    void loadBriefing();
  }, [mounted, loadQueue, loadBriefing]);

  const logInteraction = useCallback(
    async (taskId: string, action: "COMPLETED" | "SKIPPED" | "SURFACED") => {
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
          sessionId: sessionId.current,
          clientTimezone: tz,
          context: {
            timeOfDayFloat:
              new Date().getHours() + new Date().getMinutes() / 60,
            dayOfWeek: new Date().getDay(),
          },
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
    if (!top?.id || queueLoading) {
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
  }, [top?.id, queueLoading, logInteraction]);

  const handleDone = async () => {
    if (!top) {
      return;
    }
    setActing(true);
    setCardDir("left");
    try {
      await logInteraction(top.id, "COMPLETED");
      await fetchTasks();
      await loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete task");
    } finally {
      setActing(false);
      setCardDir(null);
    }
  };

  const handleSkip = async () => {
    if (!top) {
      return;
    }
    setActing(true);
    setCardDir("right");
    try {
      await logInteraction(top.id, "SKIPPED");
      await fetchTasks();
      await loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Skip failed");
    } finally {
      setActing(false);
      setCardDir(null);
    }
  };

  const handleQuickAdd = async () => {
    const title = newTitle.trim();
    if (!title) {
      setAddError("Enter a title");
      return;
    }
    setAddError(null);
    setActing(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          status: TaskStatus.TODO,
          source: "LOCAL",
          category: "PERSONAL",
          duration: 30,
          priority: "medium",
        }),
      });
      if (!res.ok) {
        throw new Error("Could not create task");
      }
      setNewTitle("");
      setAddOpen(false);
      await fetchTasks();
      await loadBriefing();
      await loadQueue();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setActing(false);
    }
  };

  const dismissBriefingAndPersist = useCallback(async () => {
    localStorage.setItem(STORAGE_LAST_BRIEFING, localDayKey());
    setShowFullBriefing(false);
    await loadQueue();
  }, [loadQueue]);

  const summaryLine = useMemo(() => {
    if (!briefingData) {
      return "";
    }
    const parts: string[] = [];
    parts.push(`${briefingData.tasksCompletedToday} done today`);
    if (briefingData.nextEvent) {
      parts.push(`Next: ${briefingData.nextEvent.title} ${briefingData.nextEvent.startsIn}`);
    }
    if (briefingData.dangerZoneTasks.length > 0) {
      parts.push(`${briefingData.dangerZoneTasks.length} danger zone task(s)`);
    }
    return parts.join(" · ");
  }, [briefingData]);

  if (!mounted) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">Loading Focus...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      {showFullBriefing && briefingLoading ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
          <p className="text-muted-foreground">Loading briefing…</p>
        </div>
      ) : null}
      {showFullBriefing && briefingData && !briefingLoading ? (
        <DailyBriefing
          data={briefingData}
          onContinue={dismissBriefingAndPersist}
        />
      ) : null}

      {!showFullBriefing ? (
        <CompactBriefing
          data={briefingData}
          summaryLine={summaryLine || "Briefing"}
          loading={briefingLoading}
        />
      ) : null}

      {error ? (
        <p className="px-4 py-2 text-sm text-destructive md:px-8" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-1 flex-col gap-6 p-4 md:flex-row md:p-8">
        <main className="flex min-h-0 flex-1 flex-col">
          {queueLoading ? (
            <p className="text-muted-foreground">Loading your next task...</p>
          ) : briefingData && briefingData.totalPendingTasks === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <p className="text-lg font-medium text-foreground">No tasks pending.</p>
              <p className="mt-2 max-w-sm text-sm">
                Connect Canvas to auto-import assignments, or tap + to add a task.
              </p>
            </div>
          ) : !top ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <p className="text-lg font-medium text-foreground">All clear.</p>
              <p className="mt-2 text-sm">0 tasks pending.</p>
              {briefingData ? (
                <p className="mt-2 text-sm">
                  You completed {briefingData.tasksCompletedToday} tasks today.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={top.id}
                  initial={{ opacity: 0, x: cardDir === "right" ? 32 : cardDir === "left" ? -32 : 0 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: cardDir === "left" ? -40 : 40 }}
                  transition={{ duration: 0.2 }}
                >
                  <FocusTaskCard task={top} />
                </motion.div>
              </AnimatePresence>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => void handleDone()}
                  className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  Done
                </button>
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => void handleSkip()}
                  className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-md border border-border bg-zinc-100 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  Skip
                </button>
              </div>
            </div>
          )}
        </main>

        {!queueLoading && top ? (
          <aside className="w-full shrink-0 md:w-72">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Up next
            </h2>
            <UpNext tasks={upNext} />
          </aside>
        ) : null}
      </div>

      <QuickAdd
        open={addOpen}
        title={newTitle}
        onTitleChange={setNewTitle}
        onSubmit={() => void handleQuickAdd()}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) {
            setAddError(null);
          }
        }}
        acting={acting}
        error={addError}
      />
    </div>
  );
}
