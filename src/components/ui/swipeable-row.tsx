"use client";

import {
  type ReactNode,
  type TouchEvent,
  useCallback,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

import {
  SWIPE_THRESHOLD_PX,
  type SwipeDirectionLock,
  computeRubberBandOffset,
  resolveSwipeDirection,
  shouldTriggerSwipe,
} from "./swipe-physics";

export type SwipeActionTone = "ok" | "rust" | "warn" | "danger" | "ink";

export interface SwipeActionConfig {
  /** Short stencil word shown behind the row, e.g. "Done", "Later", "Skip". */
  label: string;
  tone?: SwipeActionTone;
  onTrigger: () => void;
}

const TONE_CLASSES: Record<SwipeActionTone, string> = {
  ok: "bg-ok text-ok-foreground",
  rust: "bg-rust text-rust-foreground",
  warn: "bg-warning text-warning-foreground",
  danger: "bg-destructive text-destructive-foreground",
  ink: "bg-foreground text-background",
};

interface SwipeableRowProps {
  children: ReactNode;
  /** Revealed when pulling the row to the right (dx > 0). */
  rightAction?: SwipeActionConfig;
  /** Revealed when pulling the row to the left (dx < 0). */
  leftAction?: SwipeActionConfig;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * Touch-swipeable wrapper for mobile list rows and cards.
 *
 * Reveals a crate-stencil `[ ACTION ]` plate underneath as the user drags
 * horizontally, while leaving vertical scrolling and desktop pointer events
 * untouched.
 */
export function SwipeableRow({
  children,
  rightAction,
  leftAction,
  disabled = false,
  className,
  contentClassName,
}: SwipeableRowProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const lockRef = useRef<SwipeDirectionLock>(null);
  const currentOffsetRef = useRef(0);
  const suppressClickRef = useRef(false);

  const reset = useCallback(() => {
    lockRef.current = null;
    currentOffsetRef.current = 0;
    setDragging(false);
    setOffsetX(0);
  }, []);

  const onTouchStart = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (disabled || e.touches.length !== 1) return;
      const touch = e.touches[0];
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      startTimeRef.current = Date.now();
      lockRef.current = null;
      currentOffsetRef.current = 0;
      suppressClickRef.current = false;
    },
    [disabled]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (disabled || e.touches.length !== 1) return;
      if (lockRef.current === "vertical") return;

      const touch = e.touches[0];
      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;

      if (lockRef.current === null) {
        const decision = resolveSwipeDirection(dx, dy);
        if (!decision) return;
        lockRef.current = decision;
        if (decision === "vertical") return;
        setDragging(true);
      }

      const nextOffset = computeRubberBandOffset(
        dx,
        Boolean(rightAction),
        Boolean(leftAction)
      );
      const crossedBefore =
        Math.abs(currentOffsetRef.current) >= SWIPE_THRESHOLD_PX;
      const crossedNow = Math.abs(nextOffset) >= SWIPE_THRESHOLD_PX;
      if (!crossedBefore && crossedNow && typeof navigator !== "undefined") {
        navigator.vibrate?.(10);
      }

      currentOffsetRef.current = nextOffset;
      if (Math.abs(nextOffset) > 10) {
        suppressClickRef.current = true;
      }
      setOffsetX(nextOffset);
    },
    [disabled, rightAction, leftAction]
  );

  const onTouchEnd = useCallback(() => {
    if (disabled || lockRef.current !== "horizontal") {
      reset();
      return;
    }

    const finalOffset = currentOffsetRef.current;
    const elapsed = Date.now() - startTimeRef.current;
    const winner = shouldTriggerSwipe(finalOffset, elapsed);

    reset();

    if (winner === "right" && rightAction) {
      rightAction.onTrigger();
    } else if (winner === "left" && leftAction) {
      leftAction.onTrigger();
    }
  }, [disabled, rightAction, leftAction, reset]);

  const armed = Math.abs(offsetX) >= SWIPE_THRESHOLD_PX;
  const activeAction =
    offsetX > 0 ? rightAction : offsetX < 0 ? leftAction : undefined;
  const activeTone = activeAction?.tone ?? (offsetX > 0 ? "ok" : "rust");

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={reset}
      onClickCapture={(e) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      {offsetX !== 0 && activeAction ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center px-4 font-mono text-xs font-semibold uppercase tracking-[0.1em] transition-opacity duration-150",
            offsetX > 0 ? "justify-start" : "justify-end",
            TONE_CLASSES[activeTone],
            armed ? "opacity-100" : "opacity-80"
          )}
        >
          <span
            className={cn(
              "er-bracketed transition-transform duration-150",
              armed ? "scale-105" : "scale-95"
            )}
          >
            {activeAction.label}
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          "relative bg-background",
          !dragging &&
            "transition-transform duration-200 ease-field motion-reduce:transition-none",
          contentClassName
        )}
        style={
          offsetX !== 0
            ? { transform: `translate3d(${offsetX}px, 0, 0)` }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Lightweight horizontal swipe detector for full-bleed views (such as stepping
 * days/months in Calendar on a phone) where the inner surface shouldn't
 * translate with the finger.
 */
export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  disabled = false,
}: {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  disabled?: boolean;
}) {
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const lockRef = useRef<SwipeDirectionLock>(null);
  const lastDxRef = useRef(0);

  const onTouchStart = useCallback(
    (e: TouchEvent<HTMLElement>) => {
      if (disabled || e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      // Ignore touches starting on interactive controls or draggable events
      if (
        target?.closest(
          "button, a, input, select, textarea, [role='dialog'], .fc-event"
        )
      ) {
        lockRef.current = "vertical";
        return;
      }
      const touch = e.touches[0];
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      startTimeRef.current = Date.now();
      lockRef.current = null;
      lastDxRef.current = 0;
    },
    [disabled]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent<HTMLElement>) => {
      if (
        disabled ||
        e.touches.length !== 1 ||
        lockRef.current === "vertical"
      ) {
        return;
      }
      const touch = e.touches[0];
      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;
      if (lockRef.current === null) {
        const decision = resolveSwipeDirection(dx, dy);
        if (!decision) return;
        lockRef.current = decision;
        if (decision === "vertical") return;
      }
      lastDxRef.current = dx;
    },
    [disabled]
  );

  const onTouchEnd = useCallback(() => {
    if (disabled || lockRef.current !== "horizontal") {
      lockRef.current = null;
      lastDxRef.current = 0;
      return;
    }
    const dx = lastDxRef.current;
    const elapsed = Date.now() - startTimeRef.current;
    const winner = shouldTriggerSwipe(dx, elapsed);
    lockRef.current = null;
    lastDxRef.current = 0;

    if (winner === "left") {
      onSwipeLeft?.();
    } else if (winner === "right") {
      onSwipeRight?.();
    }
  }, [disabled, onSwipeLeft, onSwipeRight]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
