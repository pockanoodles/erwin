"use client";

import { useState } from "react";

import { ChevronDown, ChevronUp } from "lucide-react";

import type { BriefingData } from "@/types/focus-briefing";

import { DailyBriefing } from "./DailyBriefing";

interface CompactBriefingProps {
  data: BriefingData | null;
  summaryLine: string;
  loading?: boolean;
}

/**
 * Collapsible briefing strip after first open (docs/focus-mode.md §1.5).
 */
export function CompactBriefing({
  data,
  summaryLine,
  loading,
}: CompactBriefingProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="border-b border-border px-4 py-2 text-[13px] text-muted-foreground md:px-6">
        Loading briefing…
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-border">
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between gap-3 px-4 text-left text-[13px] md:px-6"
          onClick={() => setExpanded((e) => !e)}
        >
          <span className="text-muted-foreground">{summaryLine}</span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" />
          )}
        </button>
      </div>

      {expanded && data ? (
        <DailyBriefing data={data} onContinue={() => setExpanded(false)} />
      ) : null}
    </>
  );
}
