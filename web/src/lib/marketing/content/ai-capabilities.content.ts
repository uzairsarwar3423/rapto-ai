/**
 * ai-capabilities.content.ts
 * AI claims and extraction animation source content.
 */

export interface AIClaimItem {
  iconName: string;
  title: string;
  description: string;
}

export const aiClaims: AIClaimItem[] = [
  {
    iconName: "CheckCircle",
    title: "Detects commitments, not just tasks",
    description:
      "\"I'll look into that\" is not a commitment. \"I'll have the API docs by Thursday\" is. Claude AI knows the difference. Confidence scores tell you how certain it is.",
  },
  {
    iconName: "UserCheck",
    title: "Extracts who said it and when",
    description:
      "Every commitment is linked to the speaker, the timestamp, and the meeting where it was made. Attribution is completely automatic.",
  },
  {
    iconName: "Calendar",
    title: "Understands natural language deadlines",
    description:
      "\"By end of sprint,\" \"before the client call,\" \"next Monday morning\" — all translated to actual calendar dates. No ambiguity.",
  },
  {
    iconName: "History",
    title: "Remembers across meetings",
    description:
      "If the same commitment appears in three standups, the system recognizes it as one ongoing commitment — not three separate items.",
  },
];

export const accuracyBadgeText = "93% extraction precision verified on 5,000+ standup transcripts";
export const extractionSentence = {
  part1: "I'll ",
  part2: "finish the login feature ",
  part3: "by Thursday",
};
