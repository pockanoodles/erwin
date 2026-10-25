"use client";

import { IoChevronBack, IoChevronForward } from "react-icons/io5";

import { BarButton, BarIconButton } from "@/components/navigation/top-bar-parts";

import { hexForDate, hexLabel } from "@/lib/erwin/hex";

import { useLadderStore } from "@/store/ladder";

/**
 * The Ladder's share of the app top bar: stepping through hexes the way the
 * calendar steps through periods, and the one thing the page changes, the
 * running hex's Build. Every control is always here; the ones that don't
 * apply to the hex on show say why instead of vanishing.
 */

export function LadderTopBarViews() {
  const data = useLadderStore((s) => s.data);
  const step = useLadderStore((s) => s.step);
  const showHex = useLadderStore((s) => s.showHex);
  // Until the first answer, name the hex this browser thinks it is.
  const label = data ? data.hex.label : hexLabel(hexForDate(new Date()));
  const onCurrent = !data || data.hex.state === "current";

  return (
    <>
      <div className="flex flex-none items-center">
        <BarIconButton onClick={() => step(-1)} icon={IoChevronBack} label="Previous hex" title="Previous hex (←)" />
        {/* Fixed width, so the chevrons hold still between "May–Jun" and "Sep–Oct". */}
        <span className="min-w-[11.5rem] whitespace-nowrap px-1 text-center text-[13px] font-medium tracking-tight text-foreground">
          {label}
        </span>
        <BarIconButton onClick={() => step(1)} icon={IoChevronForward} label="Next hex" title="Next hex (→)" />
      </div>
      <BarButton
        onClick={() => !onCurrent && showHex(null)}
        title={onCurrent ? "This is the running hex" : "Back to the running hex"}
        aria-disabled={onCurrent || undefined}
      >
        Now
      </BarButton>
    </>
  );
}

export function LadderTopBarActions() {
  const data = useLadderStore((s) => s.data);
  const setBuildOpen = useLadderStore((s) => s.setBuildOpen);
  const editable = data?.hex.state === "current" && data.hex.cycleId !== null;

  return (
    <BarButton
      onClick={() => editable && setBuildOpen(true)}
      title={
        editable
          ? "Choose the stats this hex pushes"
          : "Only the running hex's Build can change, since a past one is its record"
      }
      aria-disabled={!editable || undefined}
    >
      Edit Build
    </BarButton>
  );
}
