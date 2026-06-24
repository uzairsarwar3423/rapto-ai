"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useScrollReveal
 * Hook using IntersectionObserver to detect when an element is in viewport.
 * Triggers once (once: true behavior) and disconnects automatically.
 *
 * @param threshold Fraction of the element visible before triggering (default 15%)
 */
export function useScrollReveal(threshold = 0.15) {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const currentElement = elementRef.current;
    if (!currentElement) return;

    // Browser check
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Disconnect immediately for once: true behavior
          observer.unobserve(currentElement);
        }
      },
      {
        threshold,
        rootMargin: "0px 0px -50px 0px", // Offset slightly so it reveals beautifully
      }
    );

    observer.observe(currentElement);

    return () => {
      if (currentElement) {
        observer.unobserve(currentElement);
      }
    };
  }, [threshold]);

  // Type assertion to bypass strict typing on ref binding
  return [elementRef as any, isVisible] as const;
}
