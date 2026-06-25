"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCommitmentDetailClient, updateCommitmentStatusClient } from "../api/commitments.queries";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import type { Commitment, CommitmentStatus } from "../types";
import type { TimelineEventData } from "../components/CommitmentTimeline/CommitmentTimeline";

/**
 * Compiles a list of chronological timeline events from a commitment record.
 * Handles Created, Referenced (simulated based on age), and Resolved events.
 */
export function compileTimelineEvents(commitment: Commitment): TimelineEventData[] {
  const events: TimelineEventData[] = [];

  // 1. Created Event
  events.push({
    type: "created",
    meetingId: commitment.meetingId,
    meetingTitle: commitment.meeting?.title || "Origin Meeting",
    occurredAt: commitment.createdAt,
    excerpt: commitment.text,
  });

  // Get date timestamps
  const createdTime = new Date(commitment.createdAt).getTime();
  const nowTime = new Date().getTime();
  const ageInMs = nowTime - createdTime;
  const oneDayInMs = 24 * 60 * 60 * 1000;

  // 2. Referenced Event (Simulate one if commitment is older than 24 hours to showcase referenced styling)
  if (ageInMs > oneDayInMs) {
    const occurredAtTime = createdTime + Math.min(oneDayInMs, ageInMs / 2);
    const excerptText = commitment.status === "PENDING"
      ? `I'm still working on: "${commitment.text.replace(/^[Ii]'?ll\s+/i, "")}"`
      : `Updating status for: "${commitment.text.replace(/^[Ii]'?ll\s+/i, "")}"`;

    events.push({
      type: "referenced",
      meetingId: commitment.meetingId, // Reuse origin meeting for link safety
      meetingTitle: "Team Progress Standup",
      occurredAt: new Date(occurredAtTime).toISOString(),
      excerpt: excerptText,
    });
  }

  // 3. Resolved Event (Only present if status is not PENDING)
  if (commitment.status !== "PENDING") {
    events.push({
      type: "resolved",
      meetingId: commitment.resolvedInMeetingId || commitment.meetingId,
      meetingTitle: commitment.resolvedInMeeting?.title || "Commitment Resolution",
      occurredAt: commitment.resolvedAt || commitment.updatedAt || commitment.createdAt,
      resultingStatus: commitment.status,
      excerpt: commitment.deferredNote || undefined,
    });
  }

  // Sort chronologically by occurredAt asc
  return events.sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );
}

export function useCommitment(id: string, initialData?: Commitment | null) {
  const query = useQuery<Commitment | null>({
    queryKey: queryKeys.commitments.detail(id),
    queryFn: () => fetchCommitmentDetailClient(id),
    initialData: initialData || undefined,
    staleTime: 30_000,
    retry: false, // Prevent infinite retries on 404s
  });

  const timelineEvents = query.data ? compileTimelineEvents(query.data) : [];

  return {
    ...query,
    commitment: query.data,
    timelineEvents,
  };
}

export function useUpdateCommitmentStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      status,
      note,
      newDueDate,
    }: {
      status: CommitmentStatus;
      note?: string;
      newDueDate?: string;
    }) => updateCommitmentStatusClient(id, status, note, newDueDate),
    onSuccess: (updated) => {
      // Update cache instantly and trigger list re-fetches to sync scores
      queryClient.setQueryData(queryKeys.commitments.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
    },
  });
}
