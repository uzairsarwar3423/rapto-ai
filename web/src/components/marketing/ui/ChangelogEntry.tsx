import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ChangelogEntry as ChangelogEntryType,
  CHANGELOG_CATEGORY_LABELS,
} from "@/lib/marketing/content/changelog.content";
import { ChangelogScreenshot } from "./ChangelogScreenshot";
import { ChangelogCodeDiff } from "./ChangelogCodeDiff";
import { 
  MockLinearIntegration, 
  MockScoreRing, 
  MockCrossMeetingMemory 
} from "./ChangelogMocks";

interface ChangelogEntryProps {
  entry: ChangelogEntryType;
  isLast?: boolean;
}

export function ChangelogEntry({ entry, isLast = false }: ChangelogEntryProps) {
  const categoryInfo = CHANGELOG_CATEGORY_LABELS[entry.category];

  // Friendly date formatter
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Sleek, minimal category specific styles (no emojis, professional colors)
  const categoryStyles: Record<string, string> = {
    "new-feature": "text-[var(--color-brand)] bg-[var(--color-brand-subtle)] border-[color-mix(in_srgb,var(--color-brand)_12%,transparent)]",
    improvement: "text-[#4F46E5] bg-[#EEF2FF] border-[#4F46E5]/12",
    "bug-fix": "text-neutral-600 bg-neutral-100 border-neutral-200",
    api: "text-[#0369A1] bg-[#F0F9FF] border-[#0369A1]/12",
    performance: "text-[#C2410C] bg-[#FFF7ED] border-[#C2410C]/12",
    "breaking-change": "text-red-700 bg-red-50 border-red-200",
  };

  // Render interactive mockup if matching date, otherwise render static image
  const renderVisuals = () => {
    if (entry.date === "2026-05-14") {
      return <MockLinearIntegration />;
    }
    if (entry.date === "2026-04-22") {
      return <MockScoreRing />;
    }
    if (entry.date === "2026-04-15") {
      return <MockCrossMeetingMemory />;
    }
    
    // Fallback to static image if present and not a custom mock
    if (entry.imageUrl) {
      return (
        <ChangelogScreenshot 
          src={entry.imageUrl} 
          alt={entry.imageAlt || entry.title} 
        />
      );
    }
    
    return null;
  };

  return (
    <div className="py-10 md:py-14 border-b border-[var(--color-border)] last:border-b-0 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 md:gap-8 font-sans">
      
      {/* ── Left Column: Metadata (Desktop Only) ── */}
      <div className="hidden md:flex flex-col gap-2 items-start pt-1.5 sticky top-[130px] self-start select-none">
        <time className="text-sm font-semibold font-plus-jakarta text-[var(--color-foreground)]">
          {formatDate(entry.date)}
        </time>
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold border tracking-wider uppercase",
            categoryStyles[entry.category]
          )}
        >
          {categoryInfo.label}
        </span>
      </div>

      {/* ── Right Column: Content ── */}
      <div className="flex flex-col items-start w-full">
        
        {/* Mobile Header: Date & Category (Mobile Only) */}
        <div className="flex md:hidden items-center gap-2 mb-3 text-xs select-none">
          <time className="font-semibold text-[var(--color-muted)]">
            {formatDate(entry.date)}
          </time>
          <span className="text-[var(--color-muted-subtle)]">&bull;</span>
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold border tracking-wider uppercase",
              categoryStyles[entry.category]
            )}
          >
            {categoryInfo.label}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-xl md:text-2xl font-bold font-plus-jakarta text-[var(--color-foreground)] mb-3 leading-snug tracking-tight">
          {entry.title}
        </h3>

        {/* Body content */}
        <p className="text-[14px] text-[var(--color-muted)] leading-relaxed font-light whitespace-pre-line max-w-[650px]">
          {entry.body}
        </p>

        {/* Code Diff (if present) */}
        {entry.codeDiff && <ChangelogCodeDiff code={entry.codeDiff} />}

        {/* Interactive mockups or screenshot */}
        {renderVisuals()}

        {/* Links (if present) */}
        {entry.links && entry.links.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-3">
            {entry.links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-brand)] hover:text-[var(--color-brand-mid)] transition-colors group"
              >
                <span>{link.label}</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

