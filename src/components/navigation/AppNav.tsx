"use client";

import { useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

import { useNavUIStore } from "@/store/navUi";

import { SettingsMenu } from "./SettingsMenu";

interface AppNavProps {
  className?: string;
}

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/focus", label: "Focus" },
  { href: "/calendar", label: "Calendar" },
  { href: "/tasks", label: "Tasks" },
  { href: "/courses", label: "Courses" },
  { href: "/goals", label: "Ladder" },
];

/** Left nav rail — links only. Collapsing animates the rail's width against a
 *  fixed-width inner nav, so the labels fade and get clipped instead of
 *  reflowing.
 *
 *  Collapsed is zero width, not an icon strip: the links are text-only, so a
 *  strip would be five blank rows charging 56px for them. Nothing lives in
 *  here that you lose when it's gone — the collapse toggle and search sit in
 *  the app top bar, which is always on screen at a fixed position (that
 *  replaced a semi-transparent tab that floated in the middle of the left
 *  edge, which is the thing this rail should never need again).
 *
 *  Below `md` the same links render as an overlay drawer instead. A 192px
 *  column inside a 393px viewport is half the screen, so on a phone the rail
 *  stops being a column and starts being something you pull over the page and
 *  dismiss. The top-bar toggle stays in the identical spot either way — it just
 *  drives a different piece of state. */
export function AppNav({ className }: AppNavProps) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const { isNavOpen, isDrawerOpen, isHydrated, setDrawerOpen } =
    useNavUIStore();

  // Navigating is the drawer's job done — leaving it open would bury the page
  // the tap just loaded.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname, setDrawerOpen]);

  // Rotating to landscape (or resizing a desktop window down and back) must not
  // strand a drawer open on top of the inline rail.
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile, setDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawerOpen, setDrawerOpen]);

  const label = cn(
    "transition-opacity duration-200 motion-reduce:transition-none",
    isNavOpen ? "opacity-100" : "opacity-0"
  );

  const links = (
    <>
      {LINKS.map((link) => {
        const isActive = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            title={link.label}
            tabIndex={isMobile ? (isDrawerOpen ? 0 : -1) : isNavOpen ? 0 : -1}
            className={cn(
              "mx-2 flex items-center whitespace-nowrap px-2.5 text-[13px] font-normal transition-colors duration-150",
              // 40px is fine for a pointer and under the 44px touch floor.
              isMobile ? "h-11" : "h-8",
              // Where you are is framed, crate-stencil style, in ink corner
              // brackets. It is not "now", so it stays out of the rust.
              isActive
                ? "er-brackets font-medium text-foreground [--bracket:var(--er-ink)]"
                : "text-muted-foreground hover:bg-hover hover:text-foreground"
            )}
          >
            <span className={isMobile ? undefined : label}>{link.label}</span>
          </Link>
        );
      })}
    </>
  );

  if (isMobile) {
    return (
      <>
        {/* Rendered unconditionally and faded, so the drawer can animate out
            rather than vanishing the instant state flips. */}
        <div
          onClick={() => setDrawerOpen(false)}
          aria-hidden
          className={cn(
            "fixed inset-0 z-40 bg-background/70 transition-opacity duration-200 motion-reduce:transition-none",
            isDrawerOpen
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          )}
        />
        <div
          className={cn(
            "fixed bottom-0 left-0 top-topbar z-50 w-64 border-r border-border bg-sidebar",
            "transition-transform duration-200 ease-out motion-reduce:transition-none",
            isDrawerOpen ? "translate-x-0" : "-translate-x-full",
            className
          )}
        >
          <nav
            className="flex h-full flex-col py-2"
            aria-hidden={!isDrawerOpen}
          >
            {links}
            <div className="mt-auto">
              <SettingsMenu />
            </div>
          </nav>
        </div>
      </>
    );
  }

  return (
    <div
      className={cn(
        // overflow-clip (not hidden): focusing the full-width Settings row must
        // never scroll the clipped rail and shove it offscreen.
        "er-grain h-full flex-none overflow-clip bg-sidebar",
        "transition-[width] duration-300 ease-out motion-reduce:transition-none",
        // The hairline is part of the rail, so it leaves with it — a border on
        // a zero-width element still paints a 1px line down the page.
        isNavOpen ? "w-rail border-r border-border" : "w-0",
        !isHydrated && "duration-0",
        className
      )}
    >
      <nav className="flex h-full w-rail flex-col py-3" aria-hidden={!isNavOpen}>
        {links}

        <div className="mt-auto">
          <SettingsMenu labelClassName={label} />
        </div>
      </nav>
    </div>
  );
}
