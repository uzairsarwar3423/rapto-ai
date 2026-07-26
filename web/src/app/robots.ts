import type { MetadataRoute } from "next";

/**
 * robots.ts
 *
 * Next.js App Router robots.txt generator.
 * Accessible at /robots.txt
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.rapto.cloud";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/login", "/register", "/forgot-password"],
        disallow: ["/dashboard/", "/api/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
