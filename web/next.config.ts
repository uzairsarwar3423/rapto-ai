import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow optimizing images from these remote patterns
    remotePatterns: [],
    // Enable SVG as images (for integration icons)
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Strict mode: disabled in dev to prevent double-rendering on onboarding steps
  // (React Strict Mode mounts every component twice in dev, causing visible flicker)
  reactStrictMode: process.env.NODE_ENV === "production",
};

export default nextConfig;
