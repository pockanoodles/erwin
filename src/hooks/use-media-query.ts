"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * `useSyncExternalStore` rather than `useState` + an effect: the server has no
 * viewport, so the first client render must agree with the server's HTML or
 * React throws a hydration mismatch. `getServerSnapshot` pins that first render
 * to the desktop answer and the subscription corrects it immediately after.
 *
 * Guessing "mobile" on the server instead would be worse — every desktop load
 * would paint the drawer shell for a frame before snapping back.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** Tailwind's `md` floor. Below this the nav rail becomes an overlay drawer and
 *  the task datasheet swaps to a touch-sized card list. */
export const MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
