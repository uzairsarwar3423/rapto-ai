import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";

import { FirefliesCompareHero } from "@/components/marketing/sections/FirefliesCompareHero";
import { FirefliesCompareTable } from "@/components/marketing/sections/FirefliesCompareTable";
import { FirefliesCompareFeatures } from "@/components/marketing/sections/FirefliesCompareFeatures";
import { FinalCTA } from "@/components/marketing/sections/FinalCTA";

export const metadata: Metadata = {
  title: "Rapto vs Fireflies.ai — Built for Engineering Teams",
  description:
    "Discover why engineering teams are switching from Fireflies to Rapto. Move beyond generic meeting notes to active, automated Jira syncs and accountability.",
  openGraph: {
    title: "Rapto vs Fireflies.ai",
    description: "Discover why engineering teams are switching from Fireflies to Rapto for accountability.",
    url: "https://rapto.ai/compare/fireflies",
    type: "article",
  },
};

export default function CompareFirefliesPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top announcement bar */}
      <AnnouncementBar />

      {/* Sticky header nav */}
      <MarketingNav />

      {/* Main content */}
      <main id="main-content" className="flex-grow bg-background">
        <FirefliesCompareHero />
        <FirefliesCompareTable />
        <FirefliesCompareFeatures />
        
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
