import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";

import { CaseStudyHero } from "@/components/marketing/sections/CaseStudyHero";
import { CaseStudyContent } from "@/components/marketing/sections/CaseStudyContent";
import { CaseStudyCTA } from "@/components/marketing/sections/CaseStudyCTA";

export const metadata: Metadata = {
  title: "TechCorp Case Study — Rapto",
  description:
    "Discover how TechCorp used Rapto to reduce dropped commitments by 85% and save 40 hours a week in management overhead.",
  openGraph: {
    title: "Rapto Case Study: TechCorp",
    description: "Discover how TechCorp reduced dropped commitments by 85%.",
    url: "https://rapto.ai/case-study",
    type: "article",
  },
};

export default function CaseStudyPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top announcement bar */}
      <AnnouncementBar />

      {/* Sticky header nav */}
      <MarketingNav />

      {/* Main content */}
      <main id="main-content" className="flex-grow bg-background">
        <CaseStudyHero />
        <CaseStudyContent />
        <CaseStudyCTA />
      </main>

      {/* Footer */}
      <MarketingFooter />

      {/* Sticky mobile CTA bar */}
      <MobileCTABar />
    </div>
  );
}
