import type { Metadata } from "next";
import { PricingClientPage } from "./PricingClientPage";

export const metadata: Metadata = {
  title: "Pricing Plans & ROI Calculator — Vocaply",
  description:
    "Explore flat, team-first pricing for Vocaply. Calculate your team's ROI, evaluate plan limits, and see our cost transparency breakdown. Start a 14-day free trial risk-free.",
};

export default function PricingPage() {
  return <PricingClientPage />;
}
