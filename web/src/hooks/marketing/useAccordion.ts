"use client";

/**
 * useAccordion.ts — Day 9
 * FAQ accordion state: only one item open at a time.
 * Default: first item (index 0) is open.
 */

import { useState, useCallback } from "react";

interface UseAccordionReturn {
  openIndex: number | null;
  toggle: (index: number) => void;
  isOpen: (index: number) => boolean;
}

export function useAccordion(defaultOpen: number | null = 0): UseAccordionReturn {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultOpen);

  const toggle = useCallback((index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  }, []);

  const isOpen = useCallback(
    (index: number) => openIndex === index,
    [openIndex]
  );

  return { openIndex, toggle, isOpen };
}
