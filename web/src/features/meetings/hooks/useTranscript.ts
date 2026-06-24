"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchTranscriptClient } from "../api/meetings.queries"

export function useTranscript(meetingId: string, enabled = true) {
  return useQuery({
    queryKey: ["meetings", meetingId, "transcript"],
    queryFn: () => fetchTranscriptClient(meetingId),
    enabled: !!meetingId && enabled,
    staleTime: 5 * 60 * 1000, // Transcripts are static once completed
  })
}
