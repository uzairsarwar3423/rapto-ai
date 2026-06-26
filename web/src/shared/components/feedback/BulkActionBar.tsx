"use client";

import React, { ReactNode, useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface BulkActionBarProps {
  visible: boolean;
  onDismiss?: () => void;
  children: ReactNode;
}

export function BulkActionBar({ visible, onDismiss, children }: BulkActionBarProps) {
  const [shouldRender, setShouldRender] = useState(visible);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      // Save focus target before moving focus to the toolbar
      previousActiveElementRef.current = document.activeElement as HTMLElement;
      // Auto focus the first focusable element inside the bulk bar on mount
      setTimeout(() => {
        const focusable = containerRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex="0"]'
        );
        if (focusable && focusable.length > 0) {
          (focusable[0] as HTMLElement).focus();
        }
      }, 50);
    } else {
      // Restore focus to previous target when hiding, if current focus is inside the bar
      if (
        containerRef.current &&
        containerRef.current.contains(document.activeElement) &&
        previousActiveElementRef.current
      ) {
        previousActiveElementRef.current.focus();
      }
    }
  }, [visible]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss?.();
        // Immediately restore focus upon Escape key dismiss
        if (previousActiveElementRef.current) {
          previousActiveElementRef.current.focus();
        }
      }

      if (e.key === "Tab") {
        const focusable = containerRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex="0"]'
        );
        if (!focusable || focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Wrap Shift+Tab: if active is first, focus last
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Wrap Tab: if active is last, focus first
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, onDismiss]);

  const handleTransitionEnd = () => {
    if (!visible) {
      setShouldRender(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Bulk actions"
      onTransitionEnd={handleTransitionEnd}
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-40",
        "flex items-center gap-2 h-10 px-3 rounded-lg border border-zinc-800",
        "bg-zinc-950 text-zinc-50 shadow-lg shadow-black/40",
        "transition-all duration-140 ease-out",
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2 pointer-events-none"
      )}
    >
      {children}
    </div>
  );
}

