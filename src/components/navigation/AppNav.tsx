"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BsListTask, BsCalendar } from "react-icons/bs";
import {
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight,
  HiOutlineFlag,
  HiOutlineLightBulb,
  HiOutlineSearch,
} from "react-icons/hi";

import { cn } from "@/lib/utils";

import { useNavUIStore } from "@/store/navUi";

import { SettingsMenu } from "./SettingsMenu";

interface AppNavProps {
  className?: string;
}

/** Left nav rail. Collapsing animates only the rail's width: the inner nav
 *  keeps a fixed width, so the toggle and every icon stay at the exact same
 *  coordinates in both states — labels fade and get clipped instead. */
export function AppNav({ className }: AppNavProps) {
  const pathname = usePathname();
  const { isNavOpen, isHydrated, setNavOpen } = useNavUIStore();

  // Function to trigger command palette
  const openCommandPalette = () => {
    // Simulate Cmd+K / Ctrl+K
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

  const links = [
    { href: "/focus", label: "Focus", icon: HiOutlineLightBulb },
    { href: "/calendar", label: "Calendar", icon: BsCalendar },
    { href: "/tasks", label: "Tasks", icon: BsListTask },
    { href: "/goals", label: "Bosses", icon: HiOutlineFlag },
  ];

  const label = cn(
    "transition-opacity duration-200 motion-reduce:transition-none",
    isNavOpen ? "opacity-100" : "opacity-0"
  );

  return (
    <div
      className={cn(
        // overflow-clip (not hidden): focusing the full-width Settings/search
        // rows must never scroll the clipped rail and shove the icons offscreen.
        "sticky top-0 z-40 h-dvh flex-none overflow-clip border-r border-border bg-background",
        "transition-[width] duration-300 ease-out motion-reduce:transition-none",
        isNavOpen ? "w-48" : "w-14",
        !isHydrated && "duration-0",
        className
      )}
    >
      <nav className="flex h-full w-48 flex-col py-3">
        <div className="mb-4 flex h-10 items-center">
          <button
            onClick={() => setNavOpen(!isNavOpen)}
            aria-label={isNavOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={isNavOpen}
            title={isNavOpen ? "Collapse sidebar" : "Expand sidebar"}
            className="flex h-10 w-14 flex-none items-center px-[18px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {isNavOpen ? (
              <HiOutlineChevronDoubleLeft className="h-4 w-4 flex-none" />
            ) : (
              <HiOutlineChevronDoubleRight className="h-4 w-4 flex-none" />
            )}
          </button>
          <button
            onClick={openCommandPalette}
            title="Search or run a command (⌘K)"
            tabIndex={isNavOpen ? 0 : -1}
            className={cn(
              "mr-3 flex h-8 min-w-0 flex-1 items-center gap-2 border border-border px-2 text-sm text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground",
              label,
              !isNavOpen && "pointer-events-none"
            )}
          >
            <HiOutlineSearch className="h-4 w-4 flex-none" />
            <span>Search</span>
            <kbd className="ml-auto border border-border px-1 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>
        </div>

        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;

          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.label}
              className={cn(
                "flex h-10 items-center gap-3 whitespace-nowrap px-[18px] text-sm font-medium transition-colors duration-150",
                isActive
                  ? "text-cobalt"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4 flex-none" />
              <span className={label}>{link.label}</span>
            </Link>
          );
        })}

        <div className="mt-auto">
          <SettingsMenu labelClassName={label} />
        </div>
      </nav>
    </div>
  );
}
