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
    urlBarText: "app.rapto.ai/commitments",
  },
  {
    id: "meeting-detail",
    label: "Meeting Detail",
    urlBarText: "app.rapto.ai/meetings/1234",
  },
  {
    id: "team-health",
    label: "Team Health",
    urlBarText: "app.rapto.ai/analytics/team",
  },
];

export const showcaseCaption =
  "Everything your standup produced — automatically extracted, tracked, and followed up.";
