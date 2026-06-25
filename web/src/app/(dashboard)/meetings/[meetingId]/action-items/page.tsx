import React from "react";
import { notFound } from "next/navigation";
import { getMeetingDetail } from "@/features/meetings/api/meetings.queries.server";
import { getMeetingActionItemsServer } from "@/features/action-items/api/action-items.queries.server";
import { MeetingActionItemsTab } from "@/features/meetings/components/MeetingDetail/MeetingActionItemsTab";

interface ActionItemsPageProps {
  params: Promise<{ meetingId: string }>;
}

export default async function ActionItemsPage({ params }: ActionItemsPageProps) {
  const { meetingId } = await params;

  // 1. Verify meeting exists and user has access
  const meeting = await getMeetingDetail(meetingId);
  if (!meeting) {
    notFound();
  }

  // 2. Fetch action items server-side to populate initialData for hydration
  const initialActionItems = await getMeetingActionItemsServer(meetingId);

  return (
    <MeetingActionItemsTab
      meetingId={meetingId}
      initialData={initialActionItems}
    />
  );
}
