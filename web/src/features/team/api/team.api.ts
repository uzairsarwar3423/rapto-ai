// web/src/features/team/api/team.api.ts

import { api } from "@/lib/api/client";
import type { TeamDetail, TeamHealth, TeamMember, InviteResult } from "../types/team.types";

export const teamApi = {
  /**
   * Fetch current team details
   */
  async getTeam(): Promise<TeamDetail> {
    const response = await api.get<{ data: TeamDetail }>("/teams/me");
    return response.data.data;
  },

  /**
   * Fetch team health score
   */
  async getHealth(): Promise<TeamHealth> {
    const response = await api.get<{ data: TeamHealth }>("/teams/me/health");
    return response.data.data;
  },

  /**
   * Fetch all members merged with commitment analytics for a given period
   */
  async getMembers(from?: string, to?: string): Promise<{ members: TeamMember[] }> {
    // 1. Fetch raw member profiles (roles, emails, creation dates)
    const membersResponse = await api.get<{ data: { members: any[] } }>("/teams/me/members", {
      params: { limit: 100 }, // Fetch up to 100 members client-side
    });

    // 2. Fetch members' commitment analytics (total, fulfilled, missed, fulfillmentRate)
    const analyticsResponse = await api.get<{ data: { members: any[] } }>("/analytics/members", {
      params: { from, to },
    });

    const members = membersResponse.data?.data?.members || [];
    const analytics = analyticsResponse.data?.data?.members || [];

    // 3. Perform left-merge of analytics into the member profile list
    const mergedMembers: TeamMember[] = members.map((m) => {
      const anal = analytics.find((a) => a.userId === m.id);
      return {
        id: m.id,
        name: m.name,
        email: m.email || "",
        avatarUrl: m.avatarUrl,
        role: m.role,
        commitmentScore: typeof m.commitmentScore === "number" ? m.commitmentScore : 0,
        fulfillmentRate: anal ? anal.fulfillmentRate : 0,
        onTimeRate: anal ? anal.onTimeRate : 0,
        total: anal ? anal.total : 0,
        fulfilled: anal ? anal.fulfilled : 0,
        missed: anal ? anal.missed : 0,
        pending: anal ? anal.pending : 0,
        joinedAt: m.joinedAt || m.createdAt,
        lastActiveAt: m.lastActiveAt,
        lastLoginAt: m.lastLoginAt,
        trend: "stable", // Default fallback trend per member
      };
    });

    return { members: mergedMembers };
  },

  /**
   * Invite bulk emails to the team with a specified role
   */
  async inviteMembers(payload: { emails: string[]; role: string }): Promise<InviteResult> {
    const response = await api.post<{ data: InviteResult }>("/teams/me/invite", payload);
    return response.data.data;
  },

  /**
   * Change a team member's role
   */
  async changeRole(userId: string, role: string): Promise<any> {
    const response = await api.patch<{ data: any }>(`/teams/me/members/${userId}/role`, { role });
    return response.data.data;
  },

  /**
   * Remove a member from the team
   */
  async removeMember(userId: string): Promise<any> {
    const response = await api.delete<{ data: any }>(`/teams/me/members/${userId}`);
    return response.data.data;
  },

  /**
   * Fetch a single member details
   */
  async getMember(memberId: string): Promise<TeamMember> {
    const { members } = await this.getMembers();
    const member = members.find((m) => m.id === memberId);
    if (!member) {
      throw new Error("Member not found");
    }
    return member;
  },

  /**
   * Fetch a single member's trend points
   */
  async getMemberTrend(memberId: string): Promise<any> {
    const response = await api.get<{ data: any }>("/analytics/trends", {
      params: {
        metric: "fulfillmentRate",
        granularity: "week",
        userId: memberId,
      },
    });
    return response.data.data;
  },

  /**
   * Update team settings (name, settings JSON)
   */
  async updateTeam(data: { name?: string; settings?: Record<string, any> }): Promise<any> {
    const response = await api.patch<{ data: any }>("/teams/me", data);
    return response.data.data;
  },
};
