"use client";

import { cn } from "@/lib/utils";

/** A button in an expanded task row's quick-edit toolbar. */
export function ToolbarButton({
  active,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-11 min-w-11 items-center gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.0875em] transition-colors duration-150",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
