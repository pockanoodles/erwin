export const SWIPE_LOCK_DISTANCE_PX = 8;
export const SWIPE_THRESHOLD_PX = 72;
export const SWIPE_MAX_OFFSET_PX = 132;
export const SWIPE_FLICK_MIN_PX = 36;
export const SWIPE_FLICK_VELOCITY_PX_PER_MS = 0.65;

export type SwipeDirectionLock = "horizontal" | "vertical" | null;

/**
 * Decides whether a touch gesture locks to horizontal swiping or vertical
 * scrolling once the finger has moved past the 8px deadzone. Requires a 1.2x
 * horizontal bias so diagonal thumb scrolling never hijacks vertical lists.
 */
export function resolveSwipeDirection(
  dx: number,
  dy: number
): SwipeDirectionLock {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < SWIPE_LOCK_DISTANCE_PX && absY < SWIPE_LOCK_DISTANCE_PX) {
    return null;
  }
  return absX > absY * 1.2 ? "horizontal" : "vertical";
}

/**
 * Applies resistance past the trigger threshold and clamps directions that
 * have no action attached.
 */
export function computeRubberBandOffset(
  dx: number,
  hasRightAction: boolean,
  hasLeftAction: boolean
): number {
  if (dx > 0 && !hasRightAction) return 0;
  if (dx < 0 && !hasLeftAction) return 0;

  const sign = dx >= 0 ? 1 : -1;
  const abs = Math.abs(dx);
  if (abs <= SWIPE_THRESHOLD_PX) {
    return dx;
  }
  const extra = (abs - SWIPE_THRESHOLD_PX) * 0.35;
  return sign * Math.min(SWIPE_MAX_OFFSET_PX, SWIPE_THRESHOLD_PX + extra);
}

/**
 * Fires when the row is pulled past `SWIPE_THRESHOLD_PX` or flicked quickly
 * past `SWIPE_FLICK_MIN_PX`.
 */
export function shouldTriggerSwipe(
  offset: number,
  elapsedMs: number
): "right" | "left" | null {
  const abs = Math.abs(offset);
  const velocity = elapsedMs > 0 ? abs / elapsedMs : 0;
  const triggered =
    abs >= SWIPE_THRESHOLD_PX ||
    (abs >= SWIPE_FLICK_MIN_PX && velocity >= SWIPE_FLICK_VELOCITY_PX_PER_MS);
  if (!triggered) return null;
  return offset > 0 ? "right" : "left";
}
