export const queryKeys = {
  meetings: {
    all: () => ["meetings"] as const,
    list: (filters: any) => ["meetings", "list", filters] as const,
    detail: (id: string) => ["meetings", "detail", id] as const,
    transcript: (meetingId: string) => ["meetings", meetingId, "transcript"] as const,
  },
  actionItems: {
    all: () => ["actionItems"] as const,
    byMeeting: (meetingId: string) => ["actionItems", "byMeeting", meetingId] as const,
  },
  commitments: {
    all: () => ["commitments"] as const,
    byMeeting: (meetingId: string) => ["commitments", "byMeeting", meetingId] as const,
    counts: (teamId: string) => ["commitments", "counts", teamId] as const,
    list: (teamId: string, filters: any) => ["commitments", "list", teamId, filters] as const,
    detail: (id: string) => ["commitments", "detail", id] as const,
    stats: (teamId: string, filters: any) => ["commitments", "stats", teamId, filters] as const,
  },
} as const;
