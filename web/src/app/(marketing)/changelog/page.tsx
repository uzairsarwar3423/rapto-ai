import type { Metadata } from "next";
import { ChangelogClientPage } from "./ChangelogClientPage";

export const metadata: Metadata = {
  title: "Changelog — What's new in Vocaply",
  description:
    "Follow every improvement, bug fix, and new feature in Vocaply. Updated with each release.",
  alternates: {
    canonical: "https://vocaply.com/changelog",
    types: {
      "application/rss+xml": [
        { title: "Vocaply Changelog", url: "https://vocaply.com/changelog/feed.xml" },
      ],
    },
  },
  openGraph: {
    title: "Changelog — What's new in Vocaply",
    description: "Follow every improvement, bug fix, and new feature in Vocaply. Updated with each release.",
    url: "https://vocaply.com/changelog",
    type: "website",
  },
};

export default function ChangelogPage() {
  return <ChangelogClientPage />;
}
