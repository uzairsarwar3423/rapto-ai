export type PlatformType = "ZOOM" | "GOOGLE_MEET" | "TEAMS" | "WEBEX" | "MANUAL";

export type MeetingStatus =
  | "SCHEDULED"
  | "BOT_JOINING"
  | "RECORDING"
  | "PROCESSING"
  | "DONE"
  | "FAILED"
  | "CANCELLED";

export interface MeetingFilters {
  status?: MeetingStatus[];
  platform?: PlatformType;
  from?: string; // ISO String
  to?: string;   // ISO String
  search?: string;
}

/** A single topic discussed during the meeting */
export interface TopicSection {
  topic: string;
  bullets: string[];
}

/**
 * Production-grade structured meeting summary (v4.0).
 * Matches the StructuredSummary Pydantic model in extraction_models.py.
 * All fields are optional so legacy plain-string summaries stay compatible.
 */
export interface StructuredSummary {
  meeting_purpose?: string;
  overview?: string;
  key_takeaways?: string[];
  topics_discussed?: TopicSection[];
  conclusions?: string[];
  decisions?: string[];
}

export interface MeetingListItem {
  id: string;
  title: string;
  platform: PlatformType;
  status: MeetingStatus;
  scheduledAt: string; // serialized as ISO string in JSON
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  participantCount: number;
  commitmentCount: number;
  actionItemCount: number;
  decisionCount: number;
  summary: StructuredSummary | string | null;
  createdAt: string;
}

export interface PaginationMeta {
  hasMore: boolean;
  nextCursor: string | null;
  count: number;
}

export interface PaginatedMeetingsResponse {
  meetings: MeetingListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Participant {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface MeetingDetail extends MeetingListItem {
  /** Dominant spoken language ("en" | "ur" | "hi"); set by the API (inferred for pre-multilingual rows). */
  language?: string | null;
  updatedAt?: string;
  participants: Participant[];
  mongoTranscriptId?: string | null;
  processingError?: string | null;
  botJoinedAt?: string | null;
  recordingStartedAt?: string | null;
  processingStartedAt?: string | null;
  completedAt?: string | null;
  decisions?: Array<{
    id: string;
    text: string;
    madeBy: string | null;
  }>;
}

/** Display language of generated meeting content: the language it was written in, or its English translation. */
export type MeetingDisplayLanguage = "original" | "en";

/** POST /meetings/:id/translate — translated text keyed by the ids of the ORIGINAL rows (no duplicate rows). */
export interface MeetingTranslation {
  language: "en";
  sourceLanguage: string;
  cached: boolean;
  summary: StructuredSummary | null;
  actionItems: Record<string, string>;
  commitments: Record<string, string>;
  generatedAt: string;
}

/** Languages the transcript can be translated into / displayed in. */
export type TranscriptLanguage = "en" | "ur" | "hi";

/** POST /meetings/:id/transcript/translate — translated text keyed by ORIGINAL segment id. */
export interface TranscriptTranslation {
  language: TranscriptLanguage;
  scope: "full" | "speaker";
  speaker: string | null;
  cached: boolean;
  /** Some segments could not be translated this time and keep their original text; retry fills them. */
  partial: boolean;
  translatedCount: number;
  totalCount: number;
  segments: Record<string, string>;
  generatedAt: string;
}
