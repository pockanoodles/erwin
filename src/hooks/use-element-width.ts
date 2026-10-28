"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * Measures an element's content width for density decisions during resize.
 * Returns 0 until the element is laid out.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      setWidth(el.getBoundingClientRect().width);
    };

    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref]);

  return width;
}
