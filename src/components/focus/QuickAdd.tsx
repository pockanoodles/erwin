"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface QuickAddProps {
  open: boolean;
  title: string;
  onTitleChange: (v: string) => void;
  onSubmit: () => void;
  onOpenChange: (open: boolean) => void;
  acting: boolean;
  error: string | null;
}

/**
 * Floating + and bottom sheet input (docs/focus-mode.md §3).
 */
export function QuickAdd({
  open,
  title,
  onTitleChange,
  onSubmit,
  onOpenChange,
  acting,
  error,
}: QuickAddProps) {
  return (
    <>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] bg-black/40"
            aria-label="Dismiss quick add"
            onClick={() => onOpenChange(false)}
          />
          {/* Above the phone bottom bar (z-50), which renders later. */}
          <div className="fixed bottom-0 left-0 right-0 z-[60] border-t border-border bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-lg md:left-auto md:right-6 md:max-w-md md:rounded-t-lg md:pb-4">
            <p className="mb-2 text-sm font-medium">Quick add</p>
            <Input
              placeholder="Task title — Enter to save"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              autoFocus
              disabled={acting}
            />
            {error ? (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      <Button
        type="button"
        size="icon"
        data-round
        className="fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 h-11 w-11 rounded-full shadow-lg md:bottom-6 md:right-6 md:h-12 md:w-12"
        onClick={() => onOpenChange(true)}
        aria-label="Add manual task"
      >
        <Plus className="h-5 w-5 md:h-6 md:w-6" />
      </Button>
    </>
  );
}
