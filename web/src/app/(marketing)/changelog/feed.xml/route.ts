import { changelogEntries } from "@/lib/marketing/content/changelog.content";

export async function GET() {
  const feedUrl = "https://vocaply.com/changelog";
  const rssItems = changelogEntries
    .map((entry) => {
      const pubDate = new Date(entry.date).toUTCString();
      const entryLink = `${feedUrl}#${entry.date}`;
      const description = entry.body;

      return `
    <item>
      <title><![CDATA[${entry.title}]]></title>
      <link>${entryLink}</link>
      <guid isPermaLink="false">${entry.date}-${entry.title.replace(/\s+/g, "-").toLowerCase()}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${description}]]></description>
      <category>${entry.category}</category>
    </item>`;
    })
    .join("");

  const rssFeed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Vocaply Changelog</title>
    <link>${feedUrl}</link>
    <description>Follow every improvement, bug fix, and new feature in Vocaply. Updated with each release.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://vocaply.com/changelog/feed.xml" rel="self" type="application/rss+xml" />
    ${rssItems}
  </channel>
</rss>`;

  return new Response(rssFeed, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}
