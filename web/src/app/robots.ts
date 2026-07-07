import type { MetadataRoute } from "next";

/**
 * robots.ts — Day 10
 *
 * Next.js App Router robots.txt generator.
 * Accessible at /robots.txt
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: "https://rapto.ai/sitemap.xml",
  };
}
