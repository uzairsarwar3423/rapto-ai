/**
 * product-tabs.content.ts
 * Tab definitions for the ProductShowcase section.
 * Component references (which mock view renders) are handled
 * in ProductShowcase.tsx itself — this file carries only the metadata.
 */

export interface ProductTab {
  id: "commitments" | "meeting-detail" | "team-health";
  label: string;
  urlBarText: string;
}

export const productTabs: ProductTab[] = [
  {
    id: "commitments",
    label: "Commitments",
    urlBarText: "app.vocaply.com/commitments",
  },
  {
    id: "meeting-detail",
    label: "Meeting Detail",
    urlBarText: "app.vocaply.com/meetings/1234",
  },
  {
    id: "team-health",
    label: "Team Health",
    urlBarText: "app.vocaply.com/analytics/team",
  },
];

export const showcaseCaption =
  "Everything your standup produced — automatically extracted, tracked, and followed up.";
