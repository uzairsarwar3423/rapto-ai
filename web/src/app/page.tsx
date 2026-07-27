import type { Metadata } from "next";
import { LandingHero } from "@/components/home/LandingHero";

export const metadata: Metadata = {
  title: "Rapto AI — AI Meeting Accountability for Remote Teams",
  description:
    "Rapto AI transforms meetings into clear action items, commitments, and follow-ups, so every decision becomes accountable.",
  openGraph: {
    title: "Rapto AI — AI Meeting Accountability",
    description:
      "Never lose track of what your team commits to. Rapto AI transforms meetings into clear action items and commitments.",
    url: "https://app.rapto.cloud",
    siteName: "Rapto AI",
    images: ["/og-image.png"],
  },
};

export default function HomePage() {
  return <LandingHero />;
}
