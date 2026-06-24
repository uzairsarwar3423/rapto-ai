import React from "react";
import type { Metadata } from "next";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { MeetingList } from "@/features/meetings/components/MeetingList/MeetingList";
import { getMeetings } from "@/features/meetings/api/meetings.queries.server";
import type { MeetingStatus, PlatformType } from "@/features/meetings/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Meetings | Vocaply",
  description: "Track and manage scheduled, recording, and processed meetings in Vocaply.",
};

interface MeetingsPageProps {
  searchParams: {
    status?: string;
    platform?: string;
    from?: string;
    to?: string;
    search?: string;
  };
}

export default async function MeetingsPage({ searchParams }: MeetingsPageProps) {
  const statusParam = searchParams.status;
  const platformParam = searchParams.platform;

  const filters = {
    status: statusParam ? (statusParam.split(",") as MeetingStatus[]) : undefined,
    platform: platformParam ? (platformParam as PlatformType) : undefined,
    from: searchParams.from,
    to: searchParams.to,
    search: searchParams.search,
  };

  // Pre-seed data on the server for instant rendering
  const initialData = await getMeetings(filters);

  return (
    <PageContainer>
      <MeetingList initialData={initialData} />
    </PageContainer>
  );
}
