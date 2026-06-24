import type { MetadataRoute } from "next";

/**
 * sitemap.ts — Day 10
 *
 * Next.js App Router sitemap generator.
 * Accessible at /sitemap.xml
 *
 * Once additional pages (pricing, features, etc.) are live,
 * add their URLs to the returned array.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://vocaply.com";
  const now = new Date();

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/integrations`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
