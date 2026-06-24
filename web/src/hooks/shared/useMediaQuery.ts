"use client";

import { useState, useEffect } from "react";

/**
 * Responsive breakpoint detection using window.matchMedia.
 *
 * @param query - CSS media query string, e.g. "(max-width: 768px)"
 * @returns boolean — true when the query matches
 *
 * Usage:
 *   const isMobile = useMediaQuery("(max-width: 768px)");
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);

    // Set initial state
    setMatches(mediaQuery.matches);

    // Listen for changes
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener("change", handler);

    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
