"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "rapto_announcement_dismissed";

interface UseAnnouncementBarReturn {
  isVisible: boolean;
  dismiss: () => void;
}

/**
 * Manages announcement bar visibility with localStorage persistence.
 * - On mount: checks localStorage; if previously dismissed, stays hidden
 * - dismiss(): animates bar out (CSS handles animation), then persists to localStorage
 */
export function useAnnouncementBar(): UseAnnouncementBarReturn {
  // Start hidden to avoid flash; useEffect will reveal it if not dismissed
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        setIsVisible(true);
      }
    } catch {
      // localStorage not available (SSR or privacy mode) — show bar
      setIsVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    setIsVisible(false);
    // Persist after animation (300ms height collapse)
    setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // ignore
      }
    }, 350);
  }, []);

  return { isVisible, dismiss };
}
