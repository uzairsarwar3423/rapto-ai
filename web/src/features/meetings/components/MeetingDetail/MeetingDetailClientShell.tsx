"use client";

import React from "react";
import { useMeetingDetail } from "../../hooks/useMeetingDetail";
import { useRealtimeMeeting } from "../../hooks/useRealtimeMeeting";
import { MeetingDetailHeader } from "./MeetingDetailHeader";
import { BotStatusBanner } from "./BotStatusBanner";
import { MeetingDetailTabs } from "./MeetingDetailTabs";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import type { MeetingDetail } from "../../types";

interface MeetingDetailClientShellProps {
  meetingId: string;
  initialMeeting: MeetingDetail;
  children: React.ReactNode;
}

export function MeetingDetailClientShell({
  meetingId,
  initialMeeting,
  children,
}: MeetingDetailClientShellProps) {
  // Join realtime meeting room and listen to all lifecycle transitions
  useRealtimeMeeting(meetingId);

  // Subscribe to TanStack Query cached meeting detail with initial RSC hydration
  const { data: meeting } = useMeetingDetail(meetingId, initialMeeting);

  const currentMeeting = meeting || initialMeeting;

  return (
    <PageContainer>
      <MeetingDetailHeader meeting={currentMeeting} />
      <BotStatusBanner meeting={currentMeeting} />
      <MeetingDetailTabs meetingId={currentMeeting.id} />
      <div className="mt-4">{children}</div>
    </PageContainer>
  );
}
