"use client";

import { useEffect, useState } from "react";

export type ResolvedTheme = "light" | "dark";

function read(): ResolvedTheme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/**
 * The theme on screen right now, "system" already resolved.
 *
 * Erwin's own ThemeProvider (components/providers/ThemeProvider.tsx) writes
 * the resolved theme to <html data-theme>, so this reads that attribute and
 * follows it. Components that need a concrete light/dark value for a third-
 * party prop (React Flow's colorMode, the toaster) use this rather than
 * next-themes, whose provider Erwin does not mount.
 */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>("light");
  useEffect(() => {
    setTheme(read());
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
