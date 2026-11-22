// Preloading is reserved for fonts the first paint needs (Inter, Plus Jakarta, Space Grotesk, Instrument Serif).
// Everything else keeps `preload: false`: still self-hosted and cached, but only downloaded when a screen uses it.
import { Inter, Plus_Jakarta_Sans, Geist_Mono, Poppins, Space_Grotesk, JetBrains_Mono } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],
});

export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-jakarta",
  display: "swap",
  preload: false, // only the billing plan sheet; fetched on demand instead of preloaded on every route
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  preload: false, // monospace text only; fetched on demand
});

export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-poppins",
  display: "swap",
  preload: false, // billing figures only; fetched on demand
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  preload: false, // fallback in the mono stack only; never fetched unless the primary fails
});
