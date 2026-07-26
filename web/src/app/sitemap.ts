import type { MetadataRoute } from "next";

/**
 * sitemap.ts
 *
 * Next.js App Router sitemap generator for application routes.
 * Accessible at /sitemap.xml
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.rapto.cloud";
  const now = new Date();

  return [
    {
      url: `${baseUrl}/login`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];
}
