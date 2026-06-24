import { serverApiClient } from "@/lib/api/server-client";

export interface CommitmentOwner {
  id: string;
  name: string;
  avatarUrl: string | null;
  commitmentScore: number;
}

export interface CommitmentMeeting {
  id: string;
  title: string;
  scheduledAt: string;
}

export interface CommitmentItem {
  id: string;
  status: "PENDING" | "MISSED" | "FULFILLED" | "DEFERRED";
  text: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  owner?: CommitmentOwner;
  meeting?: CommitmentMeeting;
}

export interface MeetingItem {
  id: string;
  title: string;
  platform: "GOOGLE_MEET" | "ZOOM" | "MS_TEAMS" | "OTHER";
  status: "SCHEDULED" | "BOT_JOINING" | "RECORDING" | "PROCESSING" | "DONE" | "FAILED" | "CANCELLED";
  meetingUrl: string;
  scheduledAt: string;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  type: "COMMITMENT_FULFILLED" | "COMMITMENT_CREATED" | "MEETING_RECORDED" | "BOT_JOINED" | "INVITE_SENT";
  actorName: string;
  actionText: string;
  occurredAt: string;
}

export interface TeamPulseData {
  fulfillmentRate: number;
  trend: "improving" | "declining" | "stable";
  last7DaysPoints: number[];
  total: number;
}

/**
 * Fetch commitments for the currently logged-in user.
 */
export async function getMyCommitments(): Promise<CommitmentItem[]> {
  try {
    const result = await serverApiClient.get<{ items: CommitmentItem[] }>("/commitments/my", {
      params: { limit: 5 },
    });
    return result.items || [];
  } catch (error) {
    console.error("Error fetching commitments server-side:", error);
    return [];
  }
}

/**
 * Fetch upcoming, joining, or recording meetings.
 */
export async function getUpcomingMeetings(): Promise<MeetingItem[]> {
  try {
    const result = await serverApiClient.get<MeetingItem[]>("/meetings", {
      params: {
        limit: 3,
        sortBy: "scheduledAt",
        sortOrder: "asc",
      },
    });

    // Filter for active or scheduled states
    const activeStates = ["SCHEDULED", "BOT_JOINING", "RECORDING"];
    return (result || []).filter((m) => activeStates.includes(m.status));
  } catch (error) {
    console.error("Error fetching meetings server-side:", error);
    return [];
  }
}

/**
 * Fetch analytics overview + trend metrics for the Team Pulse widget.
 */
export async function getTeamPulse(): Promise<TeamPulseData> {
  try {
    const [overview, trends] = await Promise.all([
      serverApiClient.get<{ overview: any }>("/analytics/overview"),
      serverApiClient.get<any>("/analytics/trends", {
        params: { metric: "fulfillmentRate", granularity: "week" },
      }),
    ]);

    const overviewData = overview?.overview;
    const points = trends?.points || [];
    const trendValues = points.map((p: any) => p.value);

    return {
      fulfillmentRate: typeof overviewData?.fulfillmentRate === "number" ? overviewData.fulfillmentRate : 0,
      trend: trends?.summary?.trend || "stable",
      last7DaysPoints: trendValues.length > 0 ? trendValues : [0, 0, 0, 0, 0, 0, 0],
      total: typeof overviewData?.totalCommitments === "number" ? overviewData.totalCommitments : 0,
    };
  } catch (error) {
    console.error("Error fetching team pulse server-side:", error);
    return {
      fulfillmentRate: 0,
      trend: "stable",
      last7DaysPoints: [0, 0, 0, 0, 0, 0, 0],
      total: 0,
    };
  }
}

/**
 * Fetch recent activity feed.
 */
export async function getRecentActivity(limit = 10): Promise<ActivityItem[]> {
  try {
    const result = await serverApiClient.get<ActivityItem[]>("/analytics/activity", {
      params: { limit },
    });
    return result || [];
  } catch (error) {
    console.error("Error fetching activity server-side:", error);
    return [];
  }
}
