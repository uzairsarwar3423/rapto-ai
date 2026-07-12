import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";

export const metadata: Metadata = {
  title: "Refund Policy — Rapto",
  description: "Read the Refund Policy for using Rapto.",
  openGraph: {
    title: "Refund Policy — Rapto",
    description: "Read the Refund Policy for using Rapto.",
    url: "https://rapto.ai/refunds",
    type: "website",
  },
};

export default function RefundsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <AnnouncementBar />
      <MarketingNav />

      <main id="main-content" className="flex-grow bg-[#FAFAF8] py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-8">
          <header className="mb-12 md:mb-16">
            <p className="text-brand font-semibold tracking-wider text-sm uppercase mb-4">Legal</p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground mb-6 leading-tight">
              Refund Policy
            </h1>
            <p className="font-sans text-muted text-base md:text-lg">
              Effective Date: July 12, 2026
            </p>
          </header>

          <div className="max-w-none text-muted leading-relaxed font-sans pb-24">
            <p className="mb-6">
              At Rapto, we strive to provide the best possible AI meeting assistant experience. This Refund Policy explains our guidelines regarding subscriptions, cancellations, and refunds. By subscribing to our services, you agree to this policy.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-12 mb-4">1. General Policy</h2>
            <p className="mb-6">
              Rapto operates on a subscription basis. Unless explicitly stated otherwise in this policy or required by applicable law, all charges and subscription payments are non-refundable. We do not provide refunds or credits for partial billing periods or unused time.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">2. Subscription Cancellations</h2>
            <p className="mb-6">
              You may cancel your Rapto subscription at any time through your account settings. Upon cancellation, your service will remain active until the end of your current paid billing cycle. After that date, your account will be downgraded, and you will not be charged again. We do not offer refunds for the remaining time in your active billing cycle.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">3. Exceptional Circumstances</h2>
            <p className="mb-6">
              We understand that technical issues or errors can occasionally occur. We may, at our sole discretion, issue a refund or credit in cases such as:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>Billing errors resulting in duplicate or incorrect charges.</li>
              <li>Extended, documented service downtime that significantly impacts your ability to use the platform.</li>
              <li>Major technical issues that prevent you from using core features, provided our support team is unable to resolve the issue within a reasonable timeframe after being notified.</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">4. Annual Subscriptions</h2>
            <p className="mb-6">
              For users purchasing an annual subscription for the first time, we offer a 14-day money-back guarantee. If you decide that Rapto isn't the right fit within the first 14 days of your purchase, please contact our support team for a full refund. After the initial 14-day period, annual subscriptions are non-refundable.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">5. Upgrades and Downgrades</h2>
            <p className="mb-6">
              If you upgrade your subscription plan, you will be charged a prorated amount for the remainder of the current billing cycle. If you choose to downgrade your plan, the new rate will apply at the start of your next billing cycle. We do not issue prorated refunds or credits when downgrading your account.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">6. How to Request a Refund</h2>
            <p className="mb-6">
              If you believe you are eligible for a refund under the conditions outlined above, please reach out to our billing support team at <a href="mailto:billing@rapto.ai" className="text-brand hover:underline font-medium">billing@rapto.ai</a>. Please include your account email, billing details, and a clear explanation of why you are requesting a refund. All requests are reviewed individually, and decisions are made at our sole discretion.
            </p>
          </div>
        </div>
      </main>

      <MarketingFooter />
      <MobileCTABar />
    </div>
  );
}
