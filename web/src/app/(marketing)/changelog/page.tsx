import type { Metadata } from "next";
import { ChangelogClientPage } from "./ChangelogClientPage";

export const metadata: Metadata = {
  title: "Changelog — What's new in Rapto",
  description:
    "Follow every improvement, bug fix, and new feature in Rapto. Updated with each release.",
  alternates: {
    canonical: "https://rapto.ai/changelog",
    types: {
      "application/rss+xml": [
        { title: "Rapto Changelog", url: "https://rapto.ai/changelog/feed.xml" },
      ],
    },
  },
  openGraph: {
    title: "Changelog — What's new in Rapto",
    description: "Follow every improvement, bug fix, and new feature in Rapto. Updated with each release.",
    url: "https://rapto.ai/changelog",
    type: "website",
  },
};

export default function ChangelogPage() {
  return <ChangelogClientPage />;
}
