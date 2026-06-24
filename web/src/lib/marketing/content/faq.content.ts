/**
 * faq.content.ts — Day 9
 * 8 FAQ accordion items for FAQSection.
 */

export interface FAQItem {
  question: string;
  answer: string;
}

export const faqItems: FAQItem[] = [
  {
    question: "Does my whole team need to sign up?",
    answer:
      "Only the team admin signs up initially. Team members can be invited after the first meeting is recorded — they don't need accounts before the first standup.",
  },
  {
    question: "Will the bot disrupt our meetings?",
    answer:
      "The bot announces itself when it joins (\"Vocaply is recording\"). It's silent for the rest of the meeting. Most teams stop noticing it within 2 sessions.",
  },
  {
    question: "How accurate is the AI extraction?",
    answer:
      "Extraction accuracy on standup-style meetings is above 90% for clear first-person commitments. Ambiguous statements get a lower confidence score and are flagged for review. You can edit or remove any extracted item.",
  },
  {
    question: "Does it work with our video platform?",
    answer:
      "Yes. Vocaply works with Zoom, Google Meet, and Microsoft Teams. Webex support is coming Q3 2026.",
  },
  {
    question: "Is our meeting data used to train AI models?",
    answer:
      "No. Your meeting data is never used for training. It's processed for extraction and then stored securely for your team only.",
  },
  {
    question: "What happens to data if we cancel?",
    answer:
      "You can export all your data (transcripts, commitments, action items) before cancelling. After 30 days of cancellation, data is permanently deleted.",
  },
  {
    question: "We already use Jira. Will this duplicate our tickets?",
    answer:
      "Vocaply creates Jira tickets from action items extracted in meetings. You can toggle this on or off per meeting or globally. Existing tickets are never duplicated — only new action items generate new tickets.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Yes. You can upgrade or downgrade at any time. Upgrades take effect immediately. Downgrades take effect at the end of the billing cycle.",
  },
];
