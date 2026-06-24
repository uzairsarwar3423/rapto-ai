/**
 * pricing.content.ts
 * Data for pricing plans, matching docs/pricing.md exactly.
 */

export interface PricingPlan {
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  annualBilledAs: number;   // annualPrice * 12
  memberLimit: string;
  meetingLimit: string;
  historyLimit: string;
  features: string[];
  isPopular: boolean;
  ctaText: string;
  ctaHref: string;
}

export const pricingPlans: PricingPlan[] = [
  {
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    annualBilledAs: 0,
    memberLimit: "Up to 3 members",
    meetingLimit: "5 meetings/month",
    historyLimit: "7-day retention",
    features: [
      "Bot joins Zoom / Meet / Teams",
      "Full AI extraction (commitments, tasks, decisions)",
      "Basic commitment tracker",
      "7-day transcript & history retention",
      "Slack integration (1 workspace)",
      "Basic email reminders",
      "Google Calendar auto-detect",
    ],
    isPopular: false,
    ctaText: "Start free",
    ctaHref: "/register?plan=free",
  },
  {
    name: "Starter",
    monthlyPrice: 49,
    annualPrice: 39,
    annualBilledAs: 468,
    memberLimit: "Up to 10 members",
    meetingLimit: "40 meetings/month",
    historyLimit: "90-day retention",
    features: [
      "Everything in Free",
      "Full AI extraction (enhanced)",
      "All integrations: Jira, Linear, Slack, Notion",
      "Email & Slack deadline alerts",
      "Basic team analytics",
      "Commitment score per member",
      "Searchable transcripts (90 days)",
      "Follow-up email drafts",
      "Priority email support (48h response)",
    ],
    isPopular: false,
    ctaText: "Start free trial",
    ctaHref: "/register?plan=starter",
  },
  {
    name: "Growth",
    monthlyPrice: 99,
    annualPrice: 79,
    annualBilledAs: 948,
    memberLimit: "Up to 25 members",
    meetingLimit: "120 meetings/month",
    historyLimit: "1-year retention",
    features: [
      "Everything in Starter",
      "Advanced team analytics & trend charts",
      "Team health dashboard",
      "Weekly manager digest email (Sundays)",
      "Manager view (all team commitments)",
      "Data export (CSV)",
      "1-year history",
      "Priority email + Slack support (24h response)",
      "Custom commitment categories",
      "Multiple meeting types (standups, clients, 1:1s)",
    ],
    isPopular: true,
    ctaText: "Start free trial",
    ctaHref: "/register?plan=growth",
  },
  {
    name: "Business",
    monthlyPrice: 199,
    annualPrice: 159,
    annualBilledAs: 1908,
    memberLimit: "Up to 60 members",
    meetingLimit: "300 meetings/month",
    historyLimit: "Unlimited retention",
    features: [
      "Everything in Growth",
      "Multiple workspaces (up to 5)",
      "API access (REST & webhooks)",
      "Unlimited meeting history",
      "Dedicated Slack support channel",
      "Quarterly business review call",
      "Advanced security settings",
      "Audit log (changelog tracing)",
      "Custom data retention policy",
    ],
    isPopular: false,
    ctaText: "Start free trial",
    ctaHref: "/register?plan=business",
  },
];
