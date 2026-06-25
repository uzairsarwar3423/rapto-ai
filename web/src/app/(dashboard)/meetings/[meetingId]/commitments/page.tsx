import React from "react";
import { notFound } from "next/navigation";
import { getMeetingDetail } from "@/features/meetings/api/meetings.queries.server";
import { getMeetingCommitmentsServer } from "@/features/commitments/api/commitments.queries.server";
import { MeetingCommitmentsTab } from "@/features/meetings/components/MeetingDetail/MeetingCommitmentsTab";

interface CommitmentsPageProps {
  params: Promise<{ meetingId: string }>;
}

export default async function CommitmentsPage({ params }: CommitmentsPageProps) {
  const { meetingId } = await params;

  // 1. Verify meeting exists and user has access
  const meeting = await getMeetingDetail(meetingId);
  if (!meeting) {
    notFound();
  }

  // 2. Fetch commitments server-side to populate initialData for hydration
  const initialCommitments = await getMeetingCommitmentsServer(meetingId);

  return (
    <MeetingCommitmentsTab
      meetingId={meetingId}
      initialData={initialCommitments}
    />
  );
}
