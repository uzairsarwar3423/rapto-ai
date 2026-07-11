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
  summary: string | null;
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
