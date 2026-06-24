"use client";

import { useState, useEffect } from "react";

interface UseNavScrollReturn {
  isScrolled: boolean;
}

/**
 * Tracks whether the page has been scrolled past 10px.
 * Used by MarketingNav to switch from transparent → frosted glass.
 */
export function useNavScroll(): UseNavScrollReturn {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    // Check immediately in case page loads mid-scroll
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return { isScrolled };
}
