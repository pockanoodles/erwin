"use client";

import { useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CLIENT_MODULES } from "@/modules/client";

import {
  countDanger,
  countDueToday,
  useErwinStatusStore,
} from "@/store/erwinStatus";
import { useOnModules } from "@/store/modules";

/**
 * The always-on count of what's outstanding — the app top bar's status item,
 * in the sense the macOS menu bar means it: the same numbers in the same
 * place on every *route*, so "how bad is it right now" never costs a
 * navigation. After them, each module that's on may add one count of its
 * own (Courses: unseen Canvas activity).
 *
 * It used to be the second line of the Today page's header, which meant the
 * one number worth glancing at was the one you had to be on the right page to
 * see. Clicking it goes to Today, where the list behind the numbers lives.
 *
 * Deliberately desktop-only (`lg:` and up): at 393px the bar has to hold a nav
 * toggle, a title and a create button, and three counts plus a narrative do not
 * fit beside them. So this is route-invariant, not viewport-invariant — below
 * `lg` the numbers are not shown anywhere, which is an accepted trade rather
 * than an oversight.
 */
export function ErwinStatus() {
  const pathname = usePathname();
  const tasks = useErwinStatusStore((s) => s.tasks);
  const slotNarrative = useErwinStatusStore((s) => s.slotNarrative);
  const status = useErwinStatusStore((s) => s.status);
  const load = useErwinStatusStore((s) => s.load);

  const modules = useOnModules();

  // Refresh on navigation. The store throttles this, so moving between pages
  // is free; it just means the counts can't go stale while you work.
  useEffect(() => {
    load();
  }, [load, pathname]);

  const danger = countDanger(tasks);

  return (
    // Reserved width: the counts arrive after first paint, and without a floor
    // here they'd shove the search field sideways as they land.
    <div className="hidden min-w-[15rem] items-center justify-end gap-x-1.5 truncate font-mono text-xs uppercase tracking-[0.04em] text-muted-foreground tabular lg:flex">
      {status === "error" ? (
        <span>Queue unavailable</span>
      ) : status === "ready" ? (
        <Link
          href="/today"
          className="flex items-center gap-x-1.5 truncate transition-colors duration-150 hover:text-foreground"
          title="Open Today"
        >
          <span>{tasks.length} open</span>
          <span aria-hidden>·</span>
          <span>{countDueToday(tasks)} due today</span>
          {danger > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-semibold text-destructive">
                {danger} in danger
              </span>
            </>
          ) : null}
          {slotNarrative ? (
            <>
              <span aria-hidden className="hidden 2xl:inline">
                ·
              </span>
              <span className="hidden truncate 2xl:inline">
                {slotNarrative}
              </span>
            </>
          ) : null}
        </Link>
      ) : null}
      {modules.map((m) => {
        const Status = CLIENT_MODULES[m.id].Status;
        return Status ? <Status key={m.id} /> : null;
      })}
    </div>
  );
}
