import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";

import { RoadmapHero } from "@/components/marketing/sections/RoadmapHero";
import { RoadmapBoard } from "@/components/marketing/sections/RoadmapBoard";
import { RoadmapCTA } from "@/components/marketing/sections/RoadmapCTA";

export const metadata: Metadata = {
  title: "Roadmap — See what's next for Rapto",
  description:
    "Explore our product roadmap to see what features are planned, in progress, and recently shipped. Have a feature request? Let us know.",
  openGraph: {
    title: "Rapto Roadmap",
    description: "Explore our product roadmap to see what features are planned, in progress, and recently shipped.",
    url: "https://rapto.ai/roadmap",
    type: "website",
  },
};

export default function RoadmapPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top announcement bar */}
      <AnnouncementBar />

      {/* Sticky header nav */}
      <MarketingNav />

      {/* Main content */}
      <main id="main-content" className="flex-grow bg-background">
        <RoadmapHero />
        <RoadmapBoard />
        <RoadmapCTA />
      </main>

      {/* Footer */}
      <MarketingFooter />

      {/* Sticky mobile CTA bar */}
      <MobileCTABar />
    </div>
  );
}
