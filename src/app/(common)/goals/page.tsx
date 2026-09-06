"use client";

import { useCallback, useEffect, useState } from "react";

import { BsDiagram3, BsListTask } from "react-icons/bs";

import { GoalsListView } from "@/components/goals/GoalsListView";
import { GoalsMapView } from "@/components/goals/GoalsMapView";
import { HexHeader } from "@/components/goals/HexHeader";
import { ApplyOverview, GoalsOverview } from "@/components/goals/types";

import { cn } from "@/lib/utils";

type ViewMode = "list" | "map";

export default function GoalsPage() {
  const [data, setData] = useState<GoalsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        {data ? (
          <HexHeader
            overview={data}
            apply={apply}
            refetch={loadOverview}
            readOnly={readOnly}
          />
        ) : (
          <div />
        )}
        <div className="flex border border-border">
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors duration-150",
              view === "list"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BsListTask className="h-3.5 w-3.5" />
            List
          </button>
          <button
            onClick={() => setView("map")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors duration-150",
              view === "map"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BsDiagram3 className="h-3.5 w-3.5" />
            Map
          </button>
        </div>
      </div>

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
