"use client";

import type { ComponentType } from "react";

import { usePathname } from "next/navigation";

import {
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight,
  HiOutlineMenu,
  HiOutlineSearch,
} from "react-icons/hi";

import {
  CalendarTopBarActions,
  CalendarTopBarViews,
} from "@/components/calendar/CalendarTopBar";
import { CoursesTopBarActions } from "@/components/courses/CoursesTopBar";
import { GoalsTopBarViews } from "@/components/goals/GoalsTopBar";
import { ErwinStatus } from "@/components/navigation/ErwinStatus";
import { BarDivider } from "@/components/navigation/top-bar-parts";
import {
  TasksTopBarActions,
  TasksTopBarViews,
} from "@/components/tasks/TasksTopBar";

import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

import { useCommandPaletteStore } from "@/store/commandPalette";
import { useNavUIStore } from "@/store/navUi";

/**
 * The one bar. Spans the full window above both the nav rail and the page, the
 * way an OS menu bar does, and it is the same 44px strip on every route.
 *
 * The rule that makes it worth having: a control that is in the bar is in the
 * same place on every screen. Before this, each page drew its own header —
 * different heights, different content, the rail's collapse toggle floating in
 * the middle of the left edge and vanishing when the rail was open. Anything
 * page-specific goes in the slots below; anything global (the toggle, the
 * counts, search) is fixed furniture that never moves between routes.
 */

interface RouteChrome {
  match: (pathname: string) => boolean;
  title: string;
  /** Sits left, next to the page title: view switchers, period stepping. */
  Views?: ComponentType;
  /** Sits right, before the status strip: things that change data. */
  Actions?: ComponentType;
}

const ROUTES: readonly RouteChrome[] = [
  { match: (p) => p.startsWith("/today"), title: "Today" },
  { match: (p) => p.startsWith("/focus"), title: "Focus" },
  {
    match: (p) => p.startsWith("/calendar"),
    title: "Calendar",
    Views: CalendarTopBarViews,
    Actions: CalendarTopBarActions,
  },
  {
    match: (p) => p.startsWith("/tasks"),
    title: "Tasks",
    Views: TasksTopBarViews,
    Actions: TasksTopBarActions,
  },
  {
    match: (p) => p.startsWith("/courses"),
    title: "Courses",
    Actions: CoursesTopBarActions,
  },
  {
    match: (p) => p.startsWith("/goals"),
    title: "Bosses",
    Views: GoalsTopBarViews,
  },
  { match: (p) => p.startsWith("/progress"), title: "Progress" },
  { match: (p) => p.startsWith("/settings"), title: "Settings" },
];

export function AppTopBar() {
  const pathname = usePathname() ?? "";
  const isMobile = useIsMobile();
  const { isNavOpen, isDrawerOpen, isHydrated, setNavOpen, setDrawerOpen } =
    useNavUIStore();
  const openPalette = useCommandPaletteStore((s) => s.setOpen);

  const route = ROUTES.find((r) => r.match(pathname));
  const Views = route?.Views;
  const Actions = route?.Actions;

  // Same button, same pixel, two different pieces of state behind it: on a
  // phone the rail is an overlay, so "expanded" means the drawer is over the
  // page, not that a column is holding it open.
  const isOpen = isMobile ? isDrawerOpen : isNavOpen;
  const toggle = () =>
    isMobile ? setDrawerOpen(!isDrawerOpen) : setNavOpen(!isNavOpen);

  return (
    // `relative z-50` so the mobile drawer's scrim (fixed inset-0, z-40) paints
    // *under* the bar instead of dimming it and swallowing taps on the search
    // button. The drawer itself starts at `top-topbar`, so it never overlaps.
    <header className="relative z-50 flex h-topbar flex-none items-center gap-2 border-b border-border bg-background pr-3">
      {/* The one control that never moves. Its slot is the rail's own left
          gutter, so the icon sits at exactly the same x whether the rail is
          open, closed, or mid-animation — which is the whole reason the
          floating edge tab that used to do this job is gone. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        aria-expanded={isOpen}
        title={`${isOpen ? "Collapse" : "Expand"} sidebar (⌘\\)`}
        className="flex h-full w-12 flex-none items-center pl-[18px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        {/* Direction is the only thing that changes; suppressed until hydration
            so the icon doesn't flip once on first paint. A chevron pointing
            into a column is the wrong metaphor for an overlay, so the drawer
            gets the hamburger every phone already reads as "menu". */}
        {isMobile ? (
          <HiOutlineMenu className="h-5 w-5 flex-none" />
        ) : isNavOpen || !isHydrated ? (
          <HiOutlineChevronDoubleLeft className="h-4 w-4 flex-none" />
        ) : (
          <HiOutlineChevronDoubleRight className="h-4 w-4 flex-none" />
        )}
      </button>

      {/* Scrolls rather than wraps: the bar is one 44px line on every route,
          and Calendar's D/W/M/Y plus prev/next genuinely doesn't fit 393px. */}
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <span className="flex-none whitespace-nowrap text-[13px] font-medium tracking-tight text-foreground">
          {route?.title ?? "Erwin"}
        </span>

        {Views ? (
          <>
            <BarDivider />
            <Views />
          </>
        ) : null}
      </div>

      <div className="flex flex-none items-center gap-3 pl-3">
        {Actions ? (
          <div className="flex flex-none items-center gap-2">
            <Actions />
          </div>
        ) : null}

        <ErwinStatus />

        {/* Search reads as a field because that's what it behaves like — it
            just hands off to the ⌘K palette, which already searches tasks,
            events and commands. A second search implementation would be two
            places to keep in sync for no new capability. */}
        <button
          type="button"
          onClick={() => openPalette(true)}
          aria-label="Search"
          className={cn(
            "flex flex-none items-center gap-2 rounded-md border border-border bg-background",
            "text-xs text-muted-foreground transition-colors duration-150",
            "hover:border-foreground/30 hover:text-foreground",
            // A 208px field would eat half a phone's bar to advertise a
            // shortcut no phone has. Collapses to the icon alone.
            isMobile ? "h-9 w-9 justify-center" : "h-7 w-52 px-2"
          )}
        >
          <HiOutlineSearch
            className={cn("flex-none", isMobile ? "h-4 w-4" : "h-3.5 w-3.5")}
          />
          {!isMobile && (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="flex-none font-mono text-[11px] text-muted-foreground">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
