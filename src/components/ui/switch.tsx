"use client";

import * as React from "react";

import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "er-plate er-plate-sm peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center transition-colors [--plate:var(--er-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:[--plate:var(--er-accent-band)]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "er-plate er-plate-sm pointer-events-none block h-4 w-[18px] ring-0 transition-transform duration-150 ease-field [--cut:3px] [--plate:var(--er-faint)] data-[state=checked]:translate-x-[22px] data-[state=checked]:[--plate:var(--er-accent)] data-[state=unchecked]:translate-x-1"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
