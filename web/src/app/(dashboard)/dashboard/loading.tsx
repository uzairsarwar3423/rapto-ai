import React from "react";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { PageHeader } from "@/components/shared/layout/PageHeader";
import { DashboardGrid } from "@/features/dashboard/components/DashboardGrid";
import { MyCommitmentsWidgetSkeleton } from "@/features/dashboard/components/widgets/MyCommitmentsWidgetSkeleton";
import { UpcomingMeetingsWidgetSkeleton } from "@/features/dashboard/components/widgets/UpcomingMeetingsWidgetSkeleton";
import { TeamPulseWidgetSkeleton } from "@/features/dashboard/components/widgets/TeamPulseWidgetSkeleton";
import { RecentActivityFeedSkeleton } from "@/features/dashboard/components/widgets/RecentActivityFeedSkeleton";

export default function DashboardLoading() {
  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        subtitle="Track commitments, meetings, and team performance."
      />
      <DashboardGrid>
        <MyCommitmentsWidgetSkeleton />
        <UpcomingMeetingsWidgetSkeleton />
        <TeamPulseWidgetSkeleton />
        <RecentActivityFeedSkeleton />
      </DashboardGrid>
    </PageContainer>
  );
}
