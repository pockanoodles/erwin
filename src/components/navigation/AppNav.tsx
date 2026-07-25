"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BsListTask, BsCalendar } from "react-icons/bs";
import {
  HiOutlineChevronDown,
  HiOutlineChevronUp,
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

  return (
    <>
      {/* Collapsing row: grid-rows 1fr→0fr so the content below reclaims the
          space; the bar itself slides up and fades in the same beat. */}
      <div
        className={cn(
          "grid flex-none transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          isNavOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          !isHydrated && "duration-0"
        )}
      >
        <div className="overflow-hidden">
          <nav
            className={cn(
              "z-10 h-16 border-b border-border bg-background transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none",
              !isNavOpen && "-translate-y-3 opacity-0",
              !isHydrated && "duration-0",
              className
            )}
          >
            <div className="h-full px-4 md:px-6">
              <div className="flex h-full items-center justify-between">
                <div className="flex items-center gap-6">
                  <button
                    onClick={() => setNavOpen(false)}
                    aria-label="Collapse top bar"
                    aria-expanded={isNavOpen}
                    title="Collapse top bar"
                    className="flex h-7 w-7 flex-none items-center justify-center border border-border text-muted-foreground transition-colors duration-150 hover:border-foreground/40 hover:text-foreground"
                  >
                    <HiOutlineChevronUp className="h-4 w-4" />
                  </button>
                  {links.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href;

                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          "inline-flex items-center gap-2 py-2 font-mono text-xs uppercase tracking-wide transition-colors duration-150",
                          isActive
                            ? "text-cobalt"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={openCommandPalette}
                    className="flex items-center gap-1.5 px-2 py-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    title="Search or run a command (⌘K)"
                  >
                    <HiOutlineSearch className="h-4 w-4" />
                    <span className="hidden sm:inline">Search</span>
                    <kbd className="ml-1 hidden border border-border px-1 py-0.5 font-mono text-[10px] sm:inline">
                      ⌘K
                    </kbd>
                  </button>
                  <ThemeToggle />
                  <UserMenu />
                </div>
              </div>
            </div>
          </nav>
        </div>
      </div>

      {/* Docked re-open control while the bar is collapsed */}
      {!isNavOpen ? (
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Expand top bar"
          title="Expand top bar"
          className="fixed left-0 top-0 z-50 flex h-7 w-8 items-center justify-center border-b border-r border-border bg-background text-muted-foreground transition-colors duration-150 animate-in fade-in slide-in-from-top-2 hover:text-foreground motion-reduce:animate-none"
        >
          <HiOutlineChevronDown className="h-4 w-4" />
        </button>
      ) : null}
    </>
  );
}
