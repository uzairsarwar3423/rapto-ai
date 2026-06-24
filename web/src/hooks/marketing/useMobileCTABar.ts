"use client";

/**
 * useMobileCTABar.ts — Day 9
 * Controls visibility of the fixed mobile CTA bar.
 * Bar appears after user scrolls 300px. Hidden on ≥ 768px via CSS.
 */

import { useState, useEffect } from "react";

export function useMobileCTABar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 300);
    };

    // Check initial position in case page loads scrolled
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return { visible };
}
