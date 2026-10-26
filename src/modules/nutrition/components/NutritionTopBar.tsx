"use client";

import { useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { HiOutlineAdjustments } from "react-icons/hi";

import {
  BarButton,
  type BarSegment,
  BarSegmented,
} from "@/components/navigation/top-bar-parts";

import { statusCount } from "@/modules/nutrition/macros";
import {
  type NutritionView,
  useNutritionStore,
} from "@/modules/nutrition/store";

const VIEWS: ReadonlyArray<BarSegment<NutritionView>> = [
  { id: "day", label: "Day" },
  { id: "foods", label: "Foods" },
];

/** Nutrition's views in the top bar: a day's eating, the saved foods. */
export function NutritionTopBarViews() {
  const view = useNutritionStore((s) => s.view);
  const setView = useNutritionStore((s) => s.setView);
  return (
    <BarSegmented
      label="Nutrition view"
      segments={VIEWS}
      value={view}
      onChange={setView}
    />
  );
}

/** The targets, in the pane. Bracketed rather than rust: on this page the
 *  rust is adding what you ate, the thing to do now. */
export function NutritionTopBarActions() {
  const setView = useNutritionStore((s) => s.setView);
  const select = useNutritionStore((s) => s.select);
  const view = useNutritionStore((s) => s.view);
  return (
    <BarButton
      icon={HiOutlineAdjustments}
      onClick={() => {
        if (view !== "day") setView("day");
        select("targets");
      }}
    >
      Targets
    </BarButton>
  );
}

/**
 * Nutrition's count in the top bar's status strip: the protein still to eat
 * today, or the calories when protein has no target. Nothing shows without
 * targets.
 */
export function NutritionStatus() {
  const pathname = usePathname();
  const today = useNutritionStore((s) => s.today);
  const loadToday = useNutritionStore((s) => s.loadToday);

  // Refresh on navigation; the store throttles it.
  useEffect(() => {
    void loadToday();
  }, [loadToday, pathname]);

  const count = today ? statusCount(today.eaten, today.targets) : null;
  if (!count) return null;
  return (
    <Link
      href="/nutrition"
      className="flex flex-none items-center gap-x-1.5 transition-colors duration-150 hover:text-foreground"
      title="Open Nutrition"
    >
      <span aria-hidden>·</span>
      <span>{count}</span>
    </Link>
  );
}
