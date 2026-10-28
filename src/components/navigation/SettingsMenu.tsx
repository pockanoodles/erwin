"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { useIsMobile } from "@/hooks/use-media-query";

interface SettingsMenuProps {
  labelClassName?: string;
}

/** Bottom-of-rail Settings entry: opens the Settings page directly, same as
 *  every other rail link. Theme and sign-out live on that page. */
export function SettingsMenu({ labelClassName }: SettingsMenuProps) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const isActive = pathname?.startsWith("/settings") ?? false;

  return (
    <Link
      href="/settings"
      title="Settings"
      className={cn(
        "mx-2 flex items-center whitespace-nowrap px-2.5 text-[13px] font-normal transition-colors duration-150",
        isMobile ? "h-11" : "h-8",
        isActive
          ? "er-brackets font-medium text-foreground [--bracket:var(--er-ink)]"
          : "text-muted-foreground hover:bg-hover hover:text-foreground"
      )}
    >
      <span className={isMobile ? undefined : labelClassName}>Settings</span>
    </Link>
  );
}
