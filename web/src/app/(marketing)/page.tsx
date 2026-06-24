import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { HeroSection } from "@/components/marketing/sections/HeroSection";
import { SocialProofBar } from "@/components/marketing/sections/SocialProofBar";
import { ProductShowcase } from "@/components/marketing/sections/ProductShowcase";
import { ProblemStatement } from "@/components/marketing/sections/ProblemStatement";
import { HowItWorks } from "@/components/marketing/sections/HowItWorks";
import { FeaturesGrid } from "@/components/marketing/sections/FeaturesGrid";
import { AICapabilities } from "@/components/marketing/sections/AICapabilities";
import { IntegrationsSection } from "@/components/marketing/sections/IntegrationsSection";
import { WorkflowTimeline } from "@/components/marketing/sections/WorkflowTimeline";
import { BenefitsByRole } from "@/components/marketing/sections/BenefitsByRole";
import { CustomerLogos } from "@/components/marketing/sections/CustomerLogos";
import { UseCases } from "@/components/marketing/sections/UseCases";
import { Testimonials } from "@/components/marketing/sections/Testimonials";
import { CaseStudy } from "@/components/marketing/sections/CaseStudy";
import { SecuritySection } from "@/components/marketing/sections/SecuritySection";
import { PricingPreview } from "@/components/marketing/sections/PricingPreview";
import { FAQSection } from "@/components/marketing/sections/FAQSection";
import { FinalCTA } from "@/components/marketing/sections/FinalCTA";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";
import { SkipLink } from "@/components/marketing/ui/SkipLink";

export const metadata: Metadata = {
  title: "Vocaply — AI Meeting Accountability for Remote Teams",
  description:
    "Vocaply automatically tracks every commitment made in your meetings and alerts your team when deadlines slip. Works with Zoom, Meet, and Teams. Free trial, no credit card.",
};

/**
 * Landing page — "/" route
 *
 * Section order (Days 1–9 complete):
 *   ✓ Day 2: AnnouncementBar + MarketingNav + HeroSection
 *   ✓ Day 3: SocialProofBar + ProductShowcase
 *   ✓ Day 4: ProblemStatement + HowItWorks
 *   ✓ Day 5: FeaturesGrid + AICapabilities
 *   ✓ Day 6: IntegrationsSection + WorkflowTimeline
 *   ✓ Day 7: BenefitsByRole + CustomerLogos + UseCases + Testimonials
 *   ✓ Day 8: CaseStudy + SecuritySection + PricingPreview
 *   ✓ Day 9: FAQSection + FinalCTA + MarketingFooter + MobileCTABar
 */
const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Vocaply",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "All",
  "description": "Vocaply automatically tracks every commitment made in your meetings and alerts your team when deadlines slip. Works with Zoom, Meet, and Teams. Free trial, no credit card.",
  "url": "https://vocaply.com",
  "offers": {
    "@type": "AggregateOffer",
    "priceCurrency": "USD",
    "lowPrice": "0",
    "highPrice": "199",
    "offerCount": "4",
    "offers": [
      {
        "@type": "Offer",
        "name": "Free Plan",
        "price": "0",
        "priceCurrency": "USD",
        "url": "https://vocaply.com#pricing"
      },
      {
        "@type": "Offer",
        "name": "Starter Plan",
        "price": "49",
        "priceCurrency": "USD",
        "url": "https://vocaply.com#pricing"
      },
      {
        "@type": "Offer",
        "name": "Growth Plan",
        "price": "99",
        "priceCurrency": "USD",
        "url": "https://vocaply.com#pricing"
      },
      {
        "@type": "Offer",
        "name": "Business Plan",
        "price": "199",
        "priceCurrency": "USD",
        "url": "https://vocaply.com#pricing"
      }
    ]
  }
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Does my whole team need to sign up?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Only the team admin signs up initially. Team members can be invited after the first meeting is recorded — they don't need accounts before the first standup."
      }
    },
    {
      "@type": "Question",
      "name": "Will the bot disrupt our meetings?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The bot announces itself when it joins (\"Vocaply is recording\"). It's silent for the rest of the meeting. Most teams stop noticing it within 2 sessions."
      }
    },
    {
      "@type": "Question",
      "name": "How accurate is the AI extraction?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Extraction accuracy on standup-style meetings is above 90% for clear first-person commitments. Ambiguous statements get a lower confidence score and are flagged for review. You can edit or remove any extracted item."
      }
    },
    {
      "@type": "Question",
      "name": "Does it work with our video platform?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Vocaply works with Zoom, Google Meet, and Microsoft Teams. Webex support is coming Q3 2026."
      }
    },
    {
      "@type": "Question",
      "name": "Is our meeting data used to train AI models?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Your meeting data is never used for training. It's processed for extraction and then stored securely for your team only."
      }
    },
    {
      "@type": "Question",
      "name": "What happens to data if we cancel?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "You can export all your data (transcripts, commitments, action items) before cancelling. After 30 days of cancellation, data is permanently deleted."
      }
    },
    {
      "@type": "Question",
      "name": "We already use Jira. Will this duplicate our tickets?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Vocaply creates Jira tickets from action items extracted in meetings. You can toggle this on or off per meeting or globally. Existing tickets are never duplicated — only new action items generate new tickets."
      }
    },
    {
      "@type": "Question",
      "name": "Can I change plans later?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. You can upgrade or downgrade at any time. Upgrades take effect immediately. Downgrades take effect at the end of the billing cycle."
      }
    }
  ]
};

export default function LandingPage() {
  return (
    <>
      {/* ── JSON-LD Structured Data ────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {/* ── Skip to main content (a11y) ─────────────────── */}
      <SkipLink />

      {/* ── Top announcement banner ────────────────────────── */}
      <AnnouncementBar />

      {/* ── Sticky navigation ─────────────────────────────── */}
      <MarketingNav />

      {/* ── Main content ──────────────────────────────────── */}
      <main
        id="main-content"
        style={{
          /* Extra bottom padding on mobile so MobileCTABar doesn't cover content */
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Day 2 */}
        <HeroSection />

        {/* Day 3 */}
        <SocialProofBar />
        <ProductShowcase />

        {/* Day 4 */}
        <ProblemStatement />
        <HowItWorks />

        {/* Day 5 */}
        <FeaturesGrid />
        <AICapabilities />

        {/* Day 6 */}
        <IntegrationsSection id="integrations" />
        <WorkflowTimeline />

        {/* Day 7 */}
        <BenefitsByRole />
        <CustomerLogos />
        <UseCases />
        <Testimonials />

        {/* Day 8 */}
        <CaseStudy />
        <SecuritySection />
        <PricingPreview />

        {/* Day 9 */}
        <FAQSection />
        <FinalCTA />
      </main>

      {/* ── Footer (outside main) ──────────────────────────── */}
      <MarketingFooter />

      {/* ── Mobile sticky CTA bar (outside main) ──────────── */}
      <MobileCTABar />
    </>
  );
}
