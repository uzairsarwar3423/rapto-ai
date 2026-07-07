import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WaitlistModal } from "@/components/marketing/ui/WaitlistModal";

export const metadata: Metadata = {
  title: "Join the Waitlist — Rapto",
  description:
    "Get early access to Rapto — AI that joins your standups and automatically tracks every commitment your team makes.",
};

/**
 * Marketing layout — Landing page shell.
 * Mounts the WaitlistModal globally so it can be triggered
 * from any CTA across all marketing pages.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      {children}
      <WaitlistModal />
    </div>
  );
}
