"use client";

import { useCallback, useRef, useState } from "react";

import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  type TaskColumnId,
} from "@/store/taskListViewSettings";

/**
 * Header-edge dragging.
 *
 * The drag is tracked locally and only written to the persisted store on
 * release. Committing on every pointermove would serialise the whole settings
 * blob to localStorage sixty times a second, and re-rendering the sheet from
 * the store on each frame makes the drag feel like it is catching.
 *
 * Pointer capture rather than window listeners: the pointer leaves the 4px
 * handle immediately and would otherwise strand a half-finished drag the
 * moment it crossed into a cell.
 */
export function useColumnResize(
  commit: (column: TaskColumnId, width: number) => void
) {
  const [active, setActive] = useState<{
    column: TaskColumnId;
    width: number;
  } | null>(null);
  const origin = useRef({ x: 0, width: 0 });

  const clamp = (w: number) =>
    Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(w)));

  const onPointerDown = useCallback(
    (e: React.PointerEvent, column: TaskColumnId, width: number) => {
      // The handle sits on top of the header's sort button.
      e.preventDefault();
      e.stopPropagation();
      // A drag that starts on top of text still leaves a selection behind it,
      // and a double-click to reset selects the header word. Clear both.
      window.getSelection()?.removeAllRanges();
      origin.current = { x: e.clientX, width };
      setActive({ column, width });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      setActive({
        column: active.column,
        width: clamp(origin.current.width + (e.clientX - origin.current.x)),
      });
    },
    [active]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      commit(active.column, active.width);
      setActive(null);
    },
    [active, commit]
  );

  /** Keyboard equivalent, for a handle reached by Tab. */
  const nudge = useCallback(
    (column: TaskColumnId, width: number, delta: number) =>
      commit(column, clamp(width + delta)),
    [commit]
  );

  return {
    /** The column being dragged and its live width, or null. */
    active,
    handleProps: (column: TaskColumnId, width: number) => ({
      onPointerDown: (e: React.PointerEvent) => onPointerDown(e, column, width),
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown: (e: React.KeyboardEvent) => {
        const step = e.shiftKey ? 32 : 8;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          nudge(column, width, -step);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          nudge(column, width, step);
        }
      },
    }),
  };
}
