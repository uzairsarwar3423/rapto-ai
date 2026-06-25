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

export function SegmentedTabs<T extends string>({
  value,
  onValueChange,
  items,
  className,
}: SegmentedTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<Map<T, HTMLButtonElement | null>>(new Map());

  // Local state to force trigger layout recalculation
  const [layoutTrigger, setLayoutTrigger] = useState(0);

  // Synchronously update indicator position on mount, value change, or layout trigger
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

    thumb.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    thumb.style.width = `${width}px`;
    thumb.style.height = `${height}px`;
  }, [value, items, layoutTrigger]);

  // Recalculate indicator position on window resize
  useEffect(() => {
    const handleResize = () => {
      setLayoutTrigger((prev) => prev + 1);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keyboard navigation handler (ARIA tablist standard)
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

    // Focus the next active button
    setTimeout(() => {
      const nextButton = itemRefs.current.get(nextItem.value);
      nextButton?.focus();
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
      {/* Sliding Active Indicator (Thumb) */}
      <span
        ref={thumbRef}
        className={cn(
          "absolute left-0 top-0 rounded-md bg-background border border-border/60 pointer-events-none transition-transform transition-[width] transition-[height] duration-160 ease-out-soft motion-reduce:transition-none"
        )}
      />

      {/* Tab Buttons */}
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
              "relative z-10 flex h-full items-center justify-center gap-1.5 px-3 rounded-md text-xs font-sans transition-colors duration-120 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 select-none",
              isActive
                ? "font-medium text-foreground"
                : "font-normal text-muted-foreground hover:bg-surface-hover/50 hover:text-foreground"
            )}
          >
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span className="font-mono text-2xs tabular-nums opacity-80">
                ({item.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
