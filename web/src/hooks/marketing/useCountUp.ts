"use client";

/**
 * useCountUp.ts
 * Animates a number from `from` to `to` using requestAnimationFrame.
 * Easing: easeOut cubic (fast start, slow end).
 * Triggers once when the ref element enters the viewport.
 *
 * Returns: { ref, displayValue } — bind ref to the element to observe.
 */

import { useEffect, useRef, useState, useCallback } from "react";

interface UseCountUpOptions {
  from?: number;
  to: number;
  duration?: number;   // ms, default 1500
  suffix?: string;     // e.g. "%" or "h"
  decimals?: number;   // decimal places, default 0
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useCountUp({
  from = 0,
  to,
  duration = 1500,
  suffix = "",
  decimals = 0,
}: UseCountUpOptions) {
  const [displayValue, setDisplayValue] = useState(
    `${from.toFixed(decimals)}${suffix}`
  );
  const [hasStarted, setHasStarted] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const startAnimation = useCallback(() => {
    if (hasStarted) return;
    setHasStarted(true);

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = from + (to - from) * eased;

      setDisplayValue(`${current.toFixed(decimals)}${suffix}`);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayValue(`${to.toFixed(decimals)}${suffix}`);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [from, to, duration, suffix, decimals, hasStarted]);

  // Observe element entering viewport
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      startAnimation();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startAnimation();
          observer.unobserve(el);
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startAnimation]);

  return { ref: elementRef as React.RefObject<HTMLElement>, displayValue };
}
