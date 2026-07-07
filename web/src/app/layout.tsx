import type { Metadata } from "next";
import { Instrument_Serif, DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { inter, jakarta, geistMono, poppins } from "./fonts";
import "./globals.css";
import { Providers } from "@/components/shared/providers/Providers";
import { cn } from "@/lib/utils";

// ── Instrument Serif — headlines, pull quotes ────────────────
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

// ── DM Sans — body text, UI, nav, labels ─────────────────────
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

// ── Plus Jakarta Sans — industry-level display sans-serif for auth headings ──
const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

// ── Day 10: Full production metadata ─────────────────────────
export const metadata: Metadata = {
  title: {
    default: "Rapto — AI Meeting Accountability for Remote Teams",
    template: "%s | Rapto",
  },
  description:
    "Rapto automatically tracks every commitment made in your meetings and alerts your team when deadlines slip. Works with Zoom, Meet, and Teams. Free trial, no credit card.",
  keywords: [
    "meeting accountability",
    "AI meeting notes",
    "standup tracker",
    "action item tracker",
    "meeting commitments",
    "team accountability",
    "meeting follow-up automation",
    "AI standup bot",
    "commitment tracking",
    "remote team productivity",
  ],
  authors: [{ name: "Rapto" }],
  creator: "Rapto",
  metadataBase: new URL("https://rapto.ai"),
  alternates: {
    canonical: "https://rapto.ai",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://rapto.ai",
    title: "Rapto — AI Meeting Accountability for Remote Teams",
    description:
      "Stop chasing your team. Rapto remembers every promise made in your standups — and follows up automatically.",
    siteName: "Rapto",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Rapto — AI Meeting Accountability dashboard showing commitment tracking",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rapto — AI Meeting Accountability",
    description:
      "AI that joins your standups and tracks every commitment automatically. Works with Zoom, Meet & Teams.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        instrumentSerif.variable,
        dmSans.variable,
        plusJakartaSans.variable,
        inter.variable,
        jakarta.variable,
        geistMono.variable,
        poppins.variable,
        "font-sans"
      )}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

