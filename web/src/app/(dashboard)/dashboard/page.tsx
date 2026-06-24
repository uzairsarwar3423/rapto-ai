import React, { Suspense } from "react";
import { PageContainer } from "@/components/shared/layout/PageContainer";
import { PageHeader } from "@/components/shared/layout/PageHeader";
import { DashboardGrid } from "@/features/dashboard/components/DashboardGrid";
import { QuickActionsRow } from "@/features/dashboard/components/QuickActionsRow";

import { MyCommitmentsWidget } from "@/features/dashboard/components/widgets/MyCommitmentsWidget";
import { MyCommitmentsWidgetSkeleton } from "@/features/dashboard/components/widgets/MyCommitmentsWidgetSkeleton";

import { UpcomingMeetingsWidget } from "@/features/dashboard/components/widgets/UpcomingMeetingsWidget";
import { UpcomingMeetingsWidgetSkeleton } from "@/features/dashboard/components/widgets/UpcomingMeetingsWidgetSkeleton";

import { TeamPulseWidget } from "@/features/dashboard/components/widgets/TeamPulseWidget";
import { TeamPulseWidgetSkeleton } from "@/features/dashboard/components/widgets/TeamPulseWidgetSkeleton";

import { RecentActivityFeed } from "@/features/dashboard/components/widgets/RecentActivityFeed";
import { RecentActivityFeedSkeleton } from "@/features/dashboard/components/widgets/RecentActivityFeedSkeleton";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        subtitle="Track commitments, meetings, and team performance."
        actions={<QuickActionsRow />}
      />
      <DashboardGrid>
        <Suspense fallback={<MyCommitmentsWidgetSkeleton />}>
          <MyCommitmentsWidget />
        </Suspense>

        <Suspense fallback={<UpcomingMeetingsWidgetSkeleton />}>
          <UpcomingMeetingsWidget />
        </Suspense>

        <Suspense fallback={<TeamPulseWidgetSkeleton />}>
          <TeamPulseWidget />
        </Suspense>

        <Suspense fallback={<RecentActivityFeedSkeleton />}>
          <RecentActivityFeed />
        </Suspense>
      </DashboardGrid>
    </PageContainer>
  );
}
