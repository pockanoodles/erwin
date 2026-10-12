import * as React from "react";

import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The crate-stencil kit (brand/BRAND.md § Components). Plates are painted by
 * `.er-plate` with two corners cut; set `--plate` for the colour, never a
 * `bg-*` class, which would fill the cut corners back in.
 *
 *   default      the main action: a rust plate, because rust means "now"
 *   secondary    a surface plate, for a second action beside the main one
 *   outline      corner brackets, the quiet framed action
 *   quiet        a stencil slash and the word: Skip, Cancel, Not now
 *   ghost        toolbar icon buttons
 *   destructive  a danger plate, only for actions that delete
 */
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-bold uppercase tracking-[0.12em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "er-plate text-rust-foreground hover:[--plate:var(--er-accent-text)]",
        destructive:
          "er-plate text-destructive-foreground [--plate:var(--er-danger)] hover:[--plate:color-mix(in_srgb,var(--er-danger)_85%,var(--er-ink))]",
        outline: "er-brackets text-foreground hover:bg-hover",
        secondary:
          "er-plate text-foreground [--plate:var(--er-surface)] hover:[--plate:var(--er-hover)]",
        quiet: "er-slash px-1 text-muted-foreground hover:text-foreground",
        ghost:
          "text-muted-foreground normal-case tracking-normal hover:bg-hover hover:text-foreground",
        link: "font-medium normal-case tracking-normal text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-[11px]",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
