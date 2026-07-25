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

import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

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
        "sticky top-0 z-40 h-dvh flex-none overflow-hidden border-r border-border bg-background",
        "transition-[width] duration-300 ease-out motion-reduce:transition-none",
        isNavOpen ? "w-56" : "w-14",
        !isHydrated && "duration-0",
        className
      )}
    >
      <nav className="flex h-full w-56 flex-col py-3">
        <button
          onClick={() => setNavOpen(!isNavOpen)}
          aria-label={isNavOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={isNavOpen}
          title={isNavOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="mb-4 flex h-10 items-center gap-3 px-[18px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          {isNavOpen ? (
            <HiOutlineChevronDoubleLeft className="h-4 w-4 flex-none" />
          ) : (
            <HiOutlineChevronDoubleRight className="h-4 w-4 flex-none" />
          )}
        </button>

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
          <button
            onClick={openCommandPalette}
            className="flex h-10 w-full items-center gap-3 whitespace-nowrap px-[18px] text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
            title="Search or run a command (⌘K)"
          >
            <HiOutlineSearch className="h-4 w-4 flex-none" />
            <span className={label}>Search</span>
            <kbd
              className={cn(
                "ml-auto mr-4 border border-border px-1 py-0.5 font-mono text-[10px]",
                label
              )}
            >
              ⌘K
            </kbd>
          </button>
          <div className="flex h-10 items-center px-[10px]">
            <ThemeToggle />
          </div>
          <div className="flex h-10 items-center px-[10px]">
            <UserMenu />
          </div>
        </div>
      </nav>
    </div>
  );
}
