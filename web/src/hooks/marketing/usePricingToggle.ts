"use client";

/**
 * usePricingToggle.ts
 * Manages monthly / annual pricing toggle state.
 * Returns current price set and toggle function.
 */

import { useState } from "react";
import { analytics } from "@/lib/analytics";

export function usePricingToggle() {
  const [isAnnual, setIsAnnual] = useState(false);

  const toggle = () => {
    setIsAnnual((prev) => {
      const next = !prev;
      analytics.pricingToggle(next ? "annual" : "monthly");
      return next;
    });
  };

  return { isAnnual, toggle };
}
