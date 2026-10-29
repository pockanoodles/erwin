import {
  SWIPE_MAX_OFFSET_PX,
  SWIPE_THRESHOLD_PX,
  computeRubberBandOffset,
  resolveSwipeDirection,
  shouldTriggerSwipe,
} from "@/components/ui/swipe-physics";

describe("swipeable-row gesture physics", () => {
  it("ignores movements inside the 8px deadzone", () => {
    expect(resolveSwipeDirection(4, 3)).toBeNull();
    expect(resolveSwipeDirection(-6, -5)).toBeNull();
  });

  it("locks to vertical when vertical movement dominates or is diagonal", () => {
    expect(resolveSwipeDirection(10, 12)).toBe("vertical");
    expect(resolveSwipeDirection(11, 10)).toBe("vertical");
    expect(resolveSwipeDirection(0, 20)).toBe("vertical");
  });

  it("locks to horizontal when horizontal movement exceeds 1.2x vertical", () => {
    expect(resolveSwipeDirection(20, 4)).toBe("horizontal");
    expect(resolveSwipeDirection(-24, 10)).toBe("horizontal");
  });

  it("clamps directions without a configured action and rubber-bands past threshold", () => {
    expect(computeRubberBandOffset(50, false, true)).toBe(0);
    expect(computeRubberBandOffset(-50, true, false)).toBe(0);
    expect(computeRubberBandOffset(50, true, true)).toBe(50);

    const beyond = computeRubberBandOffset(
      SWIPE_THRESHOLD_PX + 100,
      true,
      true
    );
    expect(beyond).toBeGreaterThan(SWIPE_THRESHOLD_PX);
    expect(beyond).toBeLessThanOrEqual(SWIPE_MAX_OFFSET_PX);
  });

  it("triggers on full threshold or fast flick velocity", () => {
    expect(shouldTriggerSwipe(SWIPE_THRESHOLD_PX, 400)).toBe("right");
    expect(shouldTriggerSwipe(-SWIPE_THRESHOLD_PX, 400)).toBe("left");
    // Slow partial drag does not trigger
    expect(shouldTriggerSwipe(45, 300)).toBeNull();
    // Fast flick past 36px triggers even before 72px threshold
    expect(shouldTriggerSwipe(45, 50)).toBe("right");
    expect(shouldTriggerSwipe(-45, 50)).toBe("left");
  });
});
