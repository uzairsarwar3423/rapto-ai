import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";

import { CompareHero } from "@/components/marketing/sections/CompareHero";
import { CompareTable } from "@/components/marketing/sections/CompareTable";
import { CompareFeatures } from "@/components/marketing/sections/CompareFeatures";
import { FinalCTA } from "@/components/marketing/sections/FinalCTA";

export const metadata: Metadata = {
  title: "Vocaply vs Otter.ai — The Best Tool for Engineering Teams",
  description:
    "Discover why engineering teams are switching from Otter.ai to Vocaply. Stop reading long transcripts and start automating Jira syncs and follow-ups.",
  openGraph: {
    title: "Vocaply vs Otter.ai",
    description: "Discover why engineering teams are switching from Otter.ai to Vocaply for accountability.",
    url: "https://vocaply.com/compare/otter-ai",
    type: "article",
  },
};

export default function CompareOtterPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top announcement bar */}
      <AnnouncementBar />

      {/* Sticky header nav */}
      <MarketingNav />

      {/* Main content */}
      <main id="main-content" className="flex-grow bg-background">
        <CompareHero />
        <CompareTable />
        <CompareFeatures />
        
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
