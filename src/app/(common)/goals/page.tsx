"use client";

import { useCallback, useEffect, useState } from "react";

import { GoalsListView } from "@/components/goals/GoalsListView";
import { GoalsMapView } from "@/components/goals/GoalsMapView";
import { HexHeader } from "@/components/goals/HexHeader";
import { ApplyOverview, GoalsOverview } from "@/components/goals/types";

import { cn } from "@/lib/utils";

import { useGoalsPageSettings } from "@/store/goalsPageSettings";

export default function GoalsPage() {
  const [data, setData] = useState<GoalsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The List/Map switcher lives in the app top bar
  // (components/goals/GoalsTopBar.tsx).
  const view = useGoalsPageSettings((s) => s.viewMode);
  // Goals are vault-canonical — the ops project-goals pump mirrors them in from
  // ~/Brain, so edits made here are overwritten on the next sync. The page is a
  // read-only projection viewer; author goals in the vault (Obsidian).
  const readOnly = true;

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/erwin/goals/overview");
      if (!res.ok) {
        throw new Error("Failed to load goals overview");
      }
      const json = (await res.json()) as GoalsOverview;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Optimistic local updates: views apply the change immediately and only
  // refetch to resync after a failed request.
  const apply = useCallback<ApplyOverview>((fn) => {
    setData((prev) => (prev ? fn(prev) : prev));
  }, []);

  return (
    <div
      className={cn(
        "mx-auto space-y-10 p-4 md:p-8",
        view === "map" ? "max-w-none" : "max-w-5xl"
      )}
    >
      {data ? (
        <HexHeader
          overview={data}
          apply={apply}
          refetch={loadOverview}
          readOnly={readOnly}
        />
      ) : null}

      {readOnly ? (
        <p className="border border-border bg-muted px-3 py-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">
          These goals mirror your vault (~/Brain) — edit them there
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {data ? (
        view === "list" ? (
          <GoalsListView
            overview={data}
            apply={apply}
            refetch={loadOverview}
            readOnly={readOnly}
          />
        ) : (
          <GoalsMapView
            overview={data}
            apply={apply}
            refetch={loadOverview}
            readOnly={readOnly}
          />
        )
      ) : !error ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}
    </div>
  );
}
