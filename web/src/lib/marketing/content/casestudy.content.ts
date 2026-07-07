/**
 * casestudy.content.ts
 * Data for the CaseStudy dark section.
 */

export const caseStudyContent = {
  label: "Case study",
  headlineParts: {
    before: "How TechFlow reduced missed deadlines ",
    accent: "by 70%",
    after: " in one sprint",
  },
  body:
    "TechFlow's engineering team was running daily standups with no follow-up system. Sprint after sprint, commitments made on Monday were forgotten by Wednesday. After integrating Rapto, every standup automatically produced a tracked commitment list — synced to Jira, posted to Slack, and monitored by AI.",
  pullQuote:
    '"Before Rapto, I was the human reminder system for my team. Now the system does it — and I get my Sundays back."',
  pullQuoteAttribution: "— Ali Raza, Engineering Manager at TechFlow",
  ctaText: "Read the full case study",
  ctaHref: "/case-studies/techflow",
};

export const caseStudyMetrics = [
  { to: 70, suffix: "%", label: "reduction in missed commitments" },
  { to: 2.5, suffix: "h", decimals: 1, label: "saved per manager per week" },
  { to: 88, suffix: "%", label: "team commitment rate (up from 60%)" },
];
