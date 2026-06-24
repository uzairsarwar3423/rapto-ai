import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";

import { FathomCompareHero } from "@/components/marketing/sections/FathomCompareHero";
import { FathomCompareTable } from "@/components/marketing/sections/FathomCompareTable";
import { FathomCompareFeatures } from "@/components/marketing/sections/FathomCompareFeatures";
import { FinalCTA } from "@/components/marketing/sections/FinalCTA";

export const metadata: Metadata = {
  title: "Vocaply vs Fathom Video — Engineered for Accountability",
  description:
    "Discover why engineering teams are switching from Fathom to Vocaply. Move beyond video snippets to automated Jira syncs and proactive follow-ups.",
  openGraph: {
    title: "Vocaply vs Fathom Video",
    description: "Discover why engineering teams are switching from Fathom Video to Vocaply for accountability.",
    url: "https://vocaply.com/compare/fathom",
    type: "article",
  },
};

export default function CompareFathomPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top announcement bar */}
      <AnnouncementBar />

      {/* Sticky header nav */}
      <MarketingNav />

      {/* Main content */}
      <main id="main-content" className="flex-grow bg-background">
        <FathomCompareHero />
        <FathomCompareTable />
        <FathomCompareFeatures />
        
        {/* Reuse the existing FinalCTA component to drive conversions */}
        <FinalCTA />
      </main>

      {/* Footer */}
      <MarketingFooter />

      {/* Sticky mobile CTA bar */}
      <MobileCTABar />
    </div>
  );
}
