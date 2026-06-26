import { Inter, Plus_Jakarta_Sans, Geist_Mono, Poppins } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],
});

export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700"], // ONLY semibold/bold
  variable: "--font-jakarta",
  display: "swap",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600"], // strictly 600
  variable: "--font-poppins",
  display: "swap",
});
