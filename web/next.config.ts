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
  // Strict mode for better error detection
  reactStrictMode: true,
};

export default nextConfig;
