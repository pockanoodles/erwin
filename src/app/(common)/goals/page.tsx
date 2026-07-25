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
        view === "map" ? "max-w-6xl" : "max-w-3xl"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        {data ? (
          <HexHeader overview={data} apply={apply} refetch={loadOverview} />
        ) : (
          <div />
        )}
        <div className="flex rounded-lg bg-muted p-1">
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
              view === "list"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BsListTask className="h-4 w-4" />
            List
          </button>
          <button
            onClick={() => setView("map")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
              view === "map"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BsDiagram3 className="h-4 w-4" />
            Map
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {data ? (
        view === "list" ? (
          <GoalsListView overview={data} apply={apply} refetch={loadOverview} />
        ) : (
          <GoalsMapView overview={data} apply={apply} refetch={loadOverview} />
        )
      ) : !error ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}
    </div>
  );
}
