import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";

import { AboutHero } from "@/components/marketing/sections/AboutHero";
import { AboutValues } from "@/components/marketing/sections/AboutValues";
import { AboutTeam } from "@/components/marketing/sections/AboutTeam";

export const metadata: Metadata = {
  title: "About Us — Rapto",
  description:
    "Learn about our mission to make remote work actually work, our core values, and the team building Rapto.",
  openGraph: {
    title: "About Rapto",
    description: "Learn about our mission to make remote work actually work, our core values, and the team building Rapto.",
    url: "https://rapto.ai/about",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top announcement bar */}
      <AnnouncementBar />

      {/* Sticky header nav */}
      <MarketingNav />

      {/* Main content */}
      <main id="main-content" className="flex-grow bg-background">
        <AboutHero />
        <AboutValues />
        <AboutTeam />
      </main>

      {/* Footer */}
      <MarketingFooter />

      {/* Sticky mobile CTA bar */}
      <MobileCTABar />
    </div>
  );
}
