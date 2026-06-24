"use client";

import { Suspense } from "react";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";
import { useChangelogFilter } from "@/hooks/marketing/useChangelogFilter";

// Section components
import { ChangelogHero } from "@/components/marketing/sections/ChangelogHero";
import { ChangelogFilterBar } from "@/components/marketing/sections/ChangelogFilterBar";
import { ChangelogFeed } from "@/components/marketing/sections/ChangelogFeed";

function ChangelogContent() {
  const {
    activeCategory,
    setCategory,
    searchQuery,
    setSearchQuery,
    filteredEntries,
  } = useChangelogFilter();

  return (
    <>
      {/* Changelog Hero with title & subscribe */}
      <ChangelogHero />

      {/* Filter and Search Bar */}
      <ChangelogFilterBar
        activeCategory={activeCategory}
        onCategoryChange={setCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Release entries list */}
      <ChangelogFeed entries={filteredEntries} />
    </>
  );
}

export function ChangelogClientPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top announcement bar */}
      <AnnouncementBar />

      {/* Sticky header nav */}
      <MarketingNav />

      {/* Main timeline feeds */}
      <main id="main-content" className="flex-grow">
        <Suspense fallback={
          <div className="flex items-center justify-center py-32 text-sm text-[var(--color-muted)] font-sans">
            Loading changelog...
          </div>
        }>
          <ChangelogContent />
        </Suspense>
      </main>

      {/* Footer */}
      <MarketingFooter />

      {/* Sticky mobile CTA bar */}
      <MobileCTABar />
    </div>
  );
}
