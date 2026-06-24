import type { ChangelogEntry as ChangelogEntryType } from "@/lib/marketing/content/changelog.content";
import { ChangelogEntry } from "../ui/ChangelogEntry";

interface ChangelogFeedProps {
  entries: ChangelogEntryType[];
}

export function ChangelogFeed({ entries }: ChangelogFeedProps) {
  // Helper to extract "Month Year" string (e.g., "May 2026")
  const getMonthYear = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  return (
    <section className="bg-white py-8 px-6">
      <div className="max-w-[1000px] mx-auto flex flex-col">
        {entries.map((entry, index) => {
          const currentMonthYear = getMonthYear(entry.date);
          const previousEntry = index > 0 ? entries[index - 1] : null;
          const previousMonthYear = previousEntry ? getMonthYear(previousEntry.date) : null;
          
          // Determine if we should render a month section title
          const isNewMonth = currentMonthYear !== previousMonthYear;

          return (
            <div key={entry.date + entry.title} className="flex flex-col">
              {/* Month Group Label (Left-aligned in the rail column) */}
              {isNewMonth && (
                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-0 md:gap-8 items-center pt-8 md:pt-12 select-none">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--color-muted-subtle)] font-plus-jakarta block">
                      {currentMonthYear}
                    </span>
                  </div>
                  <div className="hidden md:block h-[1px] bg-[var(--color-border)]/60" />
                </div>
              )}

              {/* Feed Entry */}
              <ChangelogEntry
                entry={entry}
                isLast={index === entries.length - 1}
              />
            </div>
          );
        })}

        {entries.length === 0 && (
          <div className="py-24 text-center text-[var(--color-muted)] font-sans border-t border-[var(--color-border)]">
            No updates found matching your search.
          </div>
        )}
      </div>
    </section>
  );
}
