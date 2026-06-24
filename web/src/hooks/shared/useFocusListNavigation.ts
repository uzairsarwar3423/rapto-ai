"use client";

import { useState, useEffect, useRef } from "react";

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.getAttribute("contenteditable") === "true" ||
    (el as HTMLElement).isContentEditable
  );
}

interface FocusListNavigationProps<T> {
  items: T[];
  onOpen: (item: T) => void;
}

export function useFocusListNavigation<T>({
  items,
  onOpen,
}: FocusListNavigationProps<T>) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignore when focus is inside an input/textarea — search box typing
      // must never accidentally move the list selection
      if (isTypingTarget(document.activeElement)) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (items.length > 0 ? Math.min(i + 1, items.length - 1) : -1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (items.length > 0 ? Math.max(i - 1, 0) : -1));
      }
      if (e.key === "Enter" && activeIndex >= 0 && activeIndex < items.length) {
        e.preventDefault();
        onOpen(items[activeIndex]);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, activeIndex, onOpen]);

  // Auto-scroll the active row into view when it moves out of viewport
  useEffect(() => {
    if (activeIndex < 0 || !containerRef.current) return;
    const row = containerRef.current.querySelector(`[data-row-index="${activeIndex}"]`);
    if (row) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  return { activeIndex, setActiveIndex, containerRef };
}
