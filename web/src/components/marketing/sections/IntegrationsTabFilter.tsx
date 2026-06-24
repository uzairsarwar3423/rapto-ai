"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  integrationsData,
  INTEGRATION_CATEGORIES,
  IntegrationCategory,
} from "@/lib/marketing/content/integrations-page.content";

interface IntegrationsTabFilterProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export function IntegrationsTabFilter({
  activeCategory,
  onCategoryChange,
}: IntegrationsTabFilterProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute category counts dynamically
  const getCategoryCount = (category: string) => {
    if (category === "All") {
      return integrationsData.length;
    }
    return integrationsData.filter((item) =>
      item.categories.includes(category as IntegrationCategory)
    ).length;
  };

  // Build the list of tabs
  const tabs = [
    { id: "All", label: "All", count: getCategoryCount("All") },
    ...INTEGRATION_CATEGORIES.map((cat) => ({
      id: cat,
      label: cat,
      count: getCategoryCount(cat),
    })),
  ];

  // Auto-scroll active tab into view on mobile
  useEffect(() => {
    const activeBtn = containerRef.current?.querySelector("[data-active='true']");
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeCategory]);

  return (
    <div className="sticky top-[60px] z-30 w-full bg-white border-b border-[var(--color-border)] shadow-sm">
      <div className="max-w-[1120px] mx-auto px-6">
        <div
          ref={containerRef}
          className="flex gap-2 overflow-x-auto py-3 scrollbar-none snap-x snap-mandatory"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {tabs.map((tab) => {
            const isActive = activeCategory === tab.id;

            return (
              <button
                key={tab.id}
                data-active={isActive}
                onClick={() => onCategoryChange(tab.id)}
                className={cn(
                  "relative flex-shrink-0 snap-start px-4 py-2 text-xs font-medium rounded-md cursor-pointer select-none transition-all duration-150",
                  isActive
                    ? "bg-[var(--color-surface)] text-[var(--color-foreground)] font-semibold border-b-2 border-[var(--color-brand)] rounded-b-none"
                    : "text-[var(--color-muted)] bg-transparent hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
                )}
              >
                {tab.label}
                {tab.id !== "Developer API" && (
                  <span className="ml-1.5 opacity-60">({tab.count})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
