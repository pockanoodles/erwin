import * as React from "react";

import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Tags and statuses, crate-stencil style. Tags are small cut plates; a status
 * is stenciled caps in brackets, [ NEXT ], coloured by what it means.
 */
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap font-mono text-[11px] font-semibold uppercase leading-none tracking-[0.08em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "er-plate er-plate-sm px-2 py-1 text-foreground [--plate:var(--er-surface)]",
        secondary: "er-plate er-plate-sm px-2 py-1 text-muted-foreground [--plate:var(--er-hover)]",
        destructive: "er-plate er-plate-sm px-2 py-1 text-destructive-foreground [--plate:var(--er-danger)]",
        outline: "er-bracketed py-1 text-muted-foreground",
        now: "er-bracketed py-1 text-rust-text",
        late: "er-bracketed py-1 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
