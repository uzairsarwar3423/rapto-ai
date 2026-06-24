import { useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHANGELOG_CATEGORY_LABELS,
  changelogEntries,
} from "@/lib/marketing/content/changelog.content";

interface ChangelogFilterBarProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ChangelogFilterBar({
  activeCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
}: ChangelogFilterBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute category item counts dynamically
  const getCategoryCount = (category: string) => {
    if (category === "All") {
      return changelogEntries.length;
    }
    return changelogEntries.filter((e) => e.category === category).length;
  };

  const categoriesList = [
    { id: "All", label: "All Updates" },
    ...Object.entries(CHANGELOG_CATEGORY_LABELS).map(([key, val]) => ({
      id: key,
      label: val.label,
    })),
  ];

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
    <div className="sticky top-[60px] z-30 w-full bg-white/80 backdrop-blur-md border-b border-[var(--color-border)]/60 py-3 px-6">
      <div className="max-w-[1000px] mx-auto flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Category Pills horizontal strip */}
        <div
          ref={containerRef}
          className="w-full md:w-auto flex gap-1.5 overflow-x-auto pb-1.5 md:pb-0 scrollbar-none snap-x"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {categoriesList.map((cat) => {
            const isActive = activeCategory === cat.id;
            const count = getCategoryCount(cat.id);

            return (
              <button
                key={cat.id}
                data-active={isActive}
                onClick={() => onCategoryChange(cat.id)}
                className={cn(
                  "relative flex-shrink-0 snap-start px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer select-none transition-all duration-150 flex items-center gap-1.5",
                  isActive
                    ? "text-[var(--color-background)] bg-[var(--color-foreground)] border-transparent shadow-xs"
                    : "text-[var(--color-muted)] bg-transparent border-transparent hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
                )}
              >
                <span>{cat.label}</span>
                <span className={cn(
                  "text-[9px] font-mono",
                  isActive ? "text-[var(--color-background)]/60" : "text-[var(--color-muted-subtle)]"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search input field */}
        <div className="relative w-full md:w-56 flex-shrink-0">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--color-muted-subtle)]" />
          <input
            type="text"
            placeholder="Search updates..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8.5 pr-8 py-2 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-foreground)] placeholder-[var(--color-muted-subtle)] focus:outline-none focus:border-[var(--color-foreground)] bg-[#FAF9F6] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-2.5 p-0.5 rounded-full hover:bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
