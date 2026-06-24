/**
 * testimonials.content.ts
 * Data for Testimonials section — 3 quote cards.
 * boldPhrase must be a substring of quote for highlighting.
 */

export interface TestimonialData {
  quote: string;
  boldPhrase: string;
  authorName: string;
  authorRole: string;
  authorCompany: string;
  initials: string;
}

export const testimonials: TestimonialData[] = [
  {
    quote:
      "I used to spend Sunday night writing follow-up emails from our Friday standup. Vocaply made that completely unnecessary. Everything is tracked, everything is sent — automatically.",
    boldPhrase: "completely unnecessary.",
    authorName: "Ali Raza",
    authorRole: "Engineering Manager",
    authorCompany: "TechFlow",
    initials: "AR",
  },
  {
    quote:
      "Our team commitment rate went from 60% to 88% in 6 weeks. Not because we hired better people — because everyone finally knew their promises were being tracked.",
    boldPhrase: "everyone finally knew their promises were being tracked.",
    authorName: "Sara Khan",
    authorRole: "Head of Product",
    authorCompany: "Buildify",
    initials: "SK",
  },
  {
    quote:
      "The Jira integration alone is worth the price. Our standups now automatically generate tickets with the right assignee and due date. We removed an entire manual step from our workflow.",
    boldPhrase: "Our standups now automatically generate tickets",
    authorName: "Ahmed Hassan",
    authorRole: "CTO",
    authorCompany: "RemoteStack",
    initials: "AH",
  },
];
