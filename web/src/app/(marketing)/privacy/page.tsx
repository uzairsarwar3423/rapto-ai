import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/marketing/layout/AnnouncementBar";
import { MarketingNav } from "@/components/marketing/layout/MarketingNav";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";
import { MobileCTABar } from "@/components/marketing/layout/MobileCTABar";

export const metadata: Metadata = {
  title: "Privacy Policy — Rapto",
  description: "Read the Privacy Policy for Rapto to understand how we handle your data.",
  openGraph: {
    title: "Privacy Policy — Rapto",
    description: "Read the Privacy Policy for Rapto to understand how we handle your data.",
    url: "https://rapto.cloud/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <AnnouncementBar />
      <MarketingNav />

      <main id="main-content" className="flex-grow bg-[#FAFAF8] py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-8">
          <header className="mb-12 md:mb-16">
            <p className="text-brand font-semibold tracking-wider text-sm uppercase mb-4">Legal</p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground mb-6 leading-tight">
              Privacy Policy
            </h1>
            <p className="font-sans text-muted text-base md:text-lg">
              Effective Date: July 12, 2026
            </p>
          </header>

          <div className="max-w-none text-muted leading-relaxed font-sans pb-24">
            <p className="mb-6">
              At Rapto, your privacy is our priority. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services. Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-12 mb-4">1. Information We Collect</h2>
            <p className="mb-6">
              We may collect information about you in a variety of ways. The information we may collect on the Site includes:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li><strong>Personal Data:</strong> Personally identifiable information, such as your name, shipping address, email address, and telephone number, and demographic information.</li>
              <li><strong>Derivative Data:</strong> Information our servers automatically collect when you access the Site, such as your IP address, your browser type, your operating system, your access times, and the pages you have viewed directly before and after accessing the Site.</li>
              <li><strong>Meeting Data:</strong> Audio recordings, transcripts, and metadata associated with your meetings processed by our AI services. This data is strictly used to provide our core features.</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">2. Use of Your Information</h2>
            <p className="mb-6">
              Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Site or our Services to:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>Create and manage your account.</li>
              <li>Process meeting audio into transcripts and action items.</li>
              <li>Improve our AI models and service offerings.</li>
              <li>Communicate with you about updates, customer support, and other administrative information.</li>
              <li>Monitor and analyze usage and trends to improve your experience with the Site.</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">3. Disclosure of Your Information</h2>
            <p className="mb-6">
              We may share information we have collected about you in certain situations. Your information may be disclosed as follows:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li><strong>By Law or to Protect Rights:</strong> If we believe the release of information about you is necessary to respond to legal process, to investigate or remedy potential violations of our policies, or to protect the rights, property, and safety of others.</li>
              <li><strong>Third-Party Service Providers:</strong> We may share your information with third parties that perform services for us or on our behalf, including payment processing, data analysis, email delivery, hosting services, and customer service.</li>
            </ul>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">4. Security of Your Information</h2>
            <p className="mb-6">
              We use administrative, technical, and physical security measures to help protect your personal information. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed against any interception or other type of misuse.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-10 mb-4">5. Contact Us</h2>
            <p className="mb-6">
              If you have questions or comments about this Privacy Policy, please contact us at: <a href="mailto:privacy@rapto.ai" className="text-brand hover:underline font-medium">privacy@rapto.ai</a>.
            </p>
          </div>
        </div>
      </main>

      <MarketingFooter />
      <MobileCTABar />
    </div>
  );
}
