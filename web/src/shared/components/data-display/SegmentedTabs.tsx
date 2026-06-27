"use client";

import React, {
  useRef,
  useLayoutEffect,
  useEffect,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface SegmentedTabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface SegmentedTabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: SegmentedTabItem<T>[];
  className?: string;
}

// Sliding indicator transition — all three properties at once
// Spring-like easing gives a premium overshoot feel on fast tabs
// Using inline style avoids the Tailwind multiple-transition-class conflict
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const SLIDE_TRANSITION = `transform 220ms ${SPRING}, width 220ms ${SPRING}, height 220ms ${SPRING}`;

export function SegmentedTabs<T extends string>({
  value,
  onValueChange,
  items,
  className,
}: SegmentedTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<Map<T, HTMLButtonElement | null>>(new Map());

  // Track whether we've done the initial paint — first render snaps, then slides
  const hasMounted = useRef(false);

  // Force recalculate on resize
  const [layoutTrigger, setLayoutTrigger] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeItem = itemRefs.current.get(value);
    const thumb = thumbRef.current;

    if (!container || !activeItem || !thumb) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeItem.getBoundingClientRect();

    const left = activeRect.left - containerRect.left;
    const width = activeRect.width;
    const height = activeRect.height;
    const top = activeRect.top - containerRect.top;

    if (!hasMounted.current) {
      // First paint: disable transition so the thumb snaps to position instantly
      thumb.style.transition = "none";
      thumb.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      thumb.style.width = `${width}px`;
      thumb.style.height = `${height}px`;

      // Re-enable transition on next frame so future changes slide
      requestAnimationFrame(() => {
        if (thumbRef.current) {
          thumbRef.current.style.transition = SLIDE_TRANSITION;
        }
        hasMounted.current = true;
      });
    } else {
      // Subsequent changes: animate the slide
      thumb.style.transition = SLIDE_TRANSITION;
      thumb.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      thumb.style.width = `${width}px`;
      thumb.style.height = `${height}px`;
    }
  }, [value, items, layoutTrigger]);

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => setLayoutTrigger((prev) => prev + 1);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keyboard navigation — ARIA tablist standard
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const activeIndex = items.findIndex((item) => item.value === value);
    if (activeIndex === -1) return;

    let nextIndex = activeIndex;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (activeIndex + 1) % items.length;
        e.preventDefault();
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (activeIndex - 1 + items.length) % items.length;
        e.preventDefault();
        break;
      case "Home":
        nextIndex = 0;
        e.preventDefault();
        break;
      case "End":
        nextIndex = items.length - 1;
        e.preventDefault();
        break;
      default:
        return;
    }

    const nextItem = items[nextIndex];
    onValueChange(nextItem.value);

    // Move DOM focus to the newly active tab
    setTimeout(() => {
      itemRefs.current.get(nextItem.value)?.focus();
    }, 0);
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={cn(
        "relative flex h-8 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 select-none font-sans",
        className
      )}
    >
      {/* ── Sliding thumb indicator ─────────────────────────────────────
          Positioned absolutely at (0,0) on mount; useLayoutEffect immediately
          moves it to the active tab. Transition is applied AFTER first paint
          so there's no flash from (0,0). Width / height animate in sync with
          transform — all via a single inline `transition` string to avoid the
          Tailwind multiple-transition-class conflict.
      ───────────────────────────────────────────────────────────────── */}
      <span
        ref={thumbRef}
        aria-hidden="true"
        className="absolute left-0 top-0 rounded-[6px] bg-[#111111] pointer-events-none will-change-transform shadow-sm"
        // transition is managed entirely via inline style in useLayoutEffect
        style={{ transition: "none" }}
      />

      {/* ── Tab buttons ─────────────────────────────────────────────── */}
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              itemRefs.current.set(item.value, el);
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            className={cn(
              // Base — always present
              "relative z-10 flex h-full items-center justify-center gap-1.5 px-3 rounded-md text-xs font-sans cursor-pointer select-none",
              // Focus ring
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              // Text color cross-fades smoothly as the pill slides
              "transition-colors duration-200",
              isActive
                ? "font-semibold text-white"
                : "font-normal text-muted-foreground hover:text-foreground"
            )}
          >
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span className="font-mono text-2xs tabular-nums opacity-70">
                ({item.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
