"use client";

import { useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { IconType } from "react-icons";
import {
  HiOutlineAcademicCap,
  HiOutlineBriefcase,
  HiOutlineCalendar,
  HiOutlineChartBar,
  HiOutlineCheckCircle,
  HiOutlineCollection,
  HiOutlineLightningBolt,
  HiOutlineMenuAlt3,
  HiOutlineSun,
} from "react-icons/hi";

import { cn } from "@/lib/utils";

import { countDanger, useSigwaldStatusStore } from "@/store/sigwaldStatus";
import { useModulesStore, useOnModules } from "@/store/modules";
import { useNavUIStore } from "@/store/navUi";

const CORE_TABS = [
  { href: "/today", label: "Today", icon: HiOutlineSun },
  { href: "/focus", label: "Focus", icon: HiOutlineLightningBolt },
  { href: "/calendar", label: "Calendar", icon: HiOutlineCalendar },
  { href: "/tasks", label: "Tasks", icon: HiOutlineCheckCircle },
] as const;

// The rail is text-only, so the bottom bar keeps its own icons, keyed by
// module id so a renamed module keeps its icon.
const MODULE_ICONS: Partial<Record<string, IconType>> = {
  courses: HiOutlineAcademicCap,
  ladder: HiOutlineChartBar,
  work: HiOutlineBriefcase,
};

/**
 * Thumb-zone navigation bar for phones (`md:hidden`).
 *
 * Holds the core phone views (Today, Focus, Calendar, Tasks), dynamically
 * surfaces the primary enabled module (whichever module is #1 in `/modules`
 * rail order, or the module page currently on screen — e.g. Work, Courses,
 * Ladder), and keeps a "More" button for the full drawer and Settings.
 * Pads for the iOS Home Indicator safe area (`env(safe-area-inset-bottom)`).
 */
export function AppBottomBar() {
  const pathname = usePathname() ?? "";
  const { isDrawerOpen, setDrawerOpen } = useNavUIStore();
  const tasks = useSigwaldStatusStore((s) => s.tasks);
  const loadStatus = useSigwaldStatusStore((s) => s.load);
  const loadModules = useModulesStore((s) => s.load);
  const onModules = useOnModules();

  useEffect(() => {
    loadStatus();
    void loadModules();
  }, [loadStatus, loadModules, pathname]);

  const dangerCount = countDanger(tasks);
  const pageModules = onModules.filter((m) => m.page);
  const activeModule = pageModules.find(
    (m) =>
      m.page &&
      (pathname === m.page.href || pathname.startsWith(`${m.page.href}/`))
  );
  // Show the currently open module in the 5th slot, or the #1 module in the
  // user's rail order (so putting Work or Courses first pins it to the bar).
  const pinnedModule = activeModule ?? pageModules[0] ?? null;

  const onCoreRoute = CORE_TABS.some((tab) => pathname.startsWith(tab.href));
  const onPinnedModule =
    pinnedModule?.page != null &&
    (pathname === pinnedModule.page.href ||
      pathname.startsWith(`${pinnedModule.page.href}/`));
  const moreActive =
    isDrawerOpen || (!onCoreRoute && !onPinnedModule && pathname.length > 1);

  const PinnedIcon =
    (pinnedModule && MODULE_ICONS[pinnedModule.id]) ?? HiOutlineCollection;

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="er-grain relative z-50 flex flex-none items-stretch border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      {CORE_TABS.map(({ href, label, icon: Icon }) => {
        const isActive =
          !isDrawerOpen &&
          (pathname === href || pathname.startsWith(`${href}/`));
        const showDangerPip = href === "/today" && dangerCount > 0;

        return (
          <Link
            key={href}
            href={href}
            onClick={() => setDrawerOpen(false)}
            className={cn(
              "relative mx-0.5 my-1 flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150",
              isActive
                ? "er-brackets font-medium text-foreground [--arm:6px] [--bracket:var(--er-ink)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="relative flex items-center justify-center">
              <Icon className="h-4 w-4" aria-hidden />
              {showDangerPip ? (
                <span
                  aria-label={`${dangerCount} in danger`}
                  className="absolute -right-2 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive"
                />
              ) : null}
            </span>
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.06em]">
              {label}
            </span>
          </Link>
        );
      })}

      {pinnedModule?.page ? (
        <Link
          href={pinnedModule.page.href}
          onClick={() => setDrawerOpen(false)}
          title={`${pinnedModule.name} (first module in rail)`}
          className={cn(
            "relative mx-0.5 my-1 flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150",
            !isDrawerOpen && onPinnedModule
              ? "er-brackets font-medium text-foreground [--arm:6px] [--bracket:var(--er-ink)]"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <PinnedIcon className="h-4 w-4" aria-hidden />
          <span className="max-w-full truncate px-0.5 font-mono text-[10px] uppercase tracking-[0.06em]">
            {pinnedModule.name}
          </span>
        </Link>
      ) : null}

      <button
        type="button"
        onClick={() => setDrawerOpen(!isDrawerOpen)}
        aria-expanded={isDrawerOpen}
        aria-label="More modules and settings"
        className={cn(
          "relative mx-0.5 my-1 flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150",
          moreActive
            ? "er-brackets font-medium text-foreground [--arm:6px] [--bracket:var(--er-ink)]"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <HiOutlineMenuAlt3 className="h-4 w-4" aria-hidden />
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.06em]">
          More
        </span>
      </button>
    </nav>
  );
}
