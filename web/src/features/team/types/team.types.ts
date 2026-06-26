// web/src/features/team/types/team.types.ts

export type UserRole = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";

export interface TeamSettings {
  allowMembersToInvite: boolean;
  defaultTimezone: string;
  weeklyDigestEnabled: boolean;
  weeklyDigestDay: "MONDAY" | "FRIDAY" | "SUNDAY";
}

export interface TeamUsage {
  meetingsUsed: number;
  meetingsLimit: number;
  meetingsPercent: number;
  membersCount: number;
  membersLimit: number;
  membersPercent: number;
  historyDays: number;
  apiAccess: boolean;
  ssoEnabled: boolean;
  billingCycleEnd: string | null;
}

export interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: TeamSettings;
  usage: TeamUsage;
  createdAt: string;
  updatedAt: string;
}

export interface TeamHealth {
  score: number;
  trend: "improving" | "stable" | "declining";
  fulfillmentRate: number;
  avgMemberScore: number;
  onTimeRate: number;
  computedAt: string;
  basedOnDays: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: UserRole;
  commitmentScore: number;
  fulfillmentRate: number;
  onTimeRate: number;
  total: number;
  fulfilled: number;
  missed: number;
  pending: number;
  joinedAt?: string;
  lastActiveAt?: string | null;
  lastLoginAt?: string | null;
  trend: "improving" | "stable" | "declining";
}

export interface InviteResult {
  invited: string[];
  alreadyMember: string[];
  alreadyInvited: string[];
  failed: string[];
  inviteLink: string;
}
