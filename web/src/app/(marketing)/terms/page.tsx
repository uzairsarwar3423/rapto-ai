import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";

export const metadata: Metadata = {
  title: "Terms of Service — Rapto",
  description: "Read the Terms of Service for using Rapto.",
  openGraph: {
    title: "Terms of Service — Rapto",
    description: "Read the Terms of Service for using Rapto.",
    url: "https://rapto.ai/terms",
    type: "website",
  },
};

export default function TermsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <AnnouncementBar />
      <MarketingNav />

      <main id="main-content" className="flex-grow bg-[#FAFAF8] py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-8">
          <header className="mb-12 md:mb-16">
            <p className="text-brand font-semibold tracking-wider text-sm uppercase mb-4">Legal</p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground mb-6 leading-tight">
              Terms of Service
            </h1>
            <p className="font-sans text-muted text-base md:text-lg">
              Effective Date: July 12, 2026
            </p>
          </header>

          <div className="max-w-none text-muted leading-relaxed font-sans pb-24">
            <p className="mb-6">
              Welcome to Rapto ("we," "our," or "us"). By accessing or using our website, services, and AI-powered meeting tools (collectively, the "Services"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use our Services.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-12 mb-4">1. Use of the Services</h2>
            <p className="mb-6">
              Rapto provides an AI meeting assistant designed to track commitments, action items, and generate summaries from audio/video meetings. You may use our Services only for lawful purposes and in accordance with these Terms. You are responsible for ensuring that your use complies with all applicable laws and regulations, including obtaining any necessary consent from participants before recording or transcribing meetings.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">2. Account Registration</h2>
            <p className="mb-6">
              To access certain features of the Services, you may be required to register for an account. You agree to provide accurate, current, and complete information during the registration process and to keep it updated. You are responsible for safeguarding your password and for all activities that occur under your account.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">3. Privacy and Data Security</h2>
            <p className="mb-6">
              Your privacy is extremely important to us. Please review our <a href="/privacy" className="text-brand hover:underline font-medium">Privacy Policy</a> to understand how we collect, use, and share information about you. By using the Services, you consent to the processing of your data as outlined in the Privacy Policy.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">4. Intellectual Property Rights</h2>
            <p className="mb-6">
              The Services and their entire contents, features, and functionality (including but not limited to all information, software, text, displays, images, video, and audio, and the design, selection, and arrangement thereof) are owned by Rapto, its licensors, or other providers of such material and are protected by United States and international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">5. Limitation of Liability</h2>
            <p className="mb-6">
              In no event will Rapto, its affiliates, or their licensors, service providers, employees, agents, officers, or directors be liable for damages of any kind, under any legal theory, arising out of or in connection with your use, or inability to use, the Services, any websites linked to it, any content on the Services or such other websites, including any direct, indirect, special, incidental, consequential, or punitive damages.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">6. Changes to the Terms</h2>
            <p className="mb-6">
              We may revise and update these Terms from time to time in our sole discretion. All changes are effective immediately when we post them, and apply to all access to and use of the Services thereafter. Your continued use of the Services following the posting of revised Terms means that you accept and agree to the changes.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">7. Contact Us</h2>
            <p className="mb-6">
              If you have any questions about these Terms, please contact us at <a href="mailto:legal@rapto.ai" className="text-brand hover:underline font-medium">legal@rapto.ai</a>.
            </p>
          </div>
        </div>
      </main>

      <MarketingFooter />
      <MobileCTABar />
    </div>
  );
}
