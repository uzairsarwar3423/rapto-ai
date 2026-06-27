export type TeamIntegrationProvider = 'JIRA' | 'LINEAR' | 'SLACK' | 'NOTION';
export type UserIntegrationProvider = 'GOOGLE_CALENDAR' | 'OUTLOOK_CALENDAR';
export type IntegrationProvider = TeamIntegrationProvider | UserIntegrationProvider;

export interface TeamIntegration {
  id: string;
  provider: TeamIntegrationProvider;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceUrl: string | null;
  isActive: boolean;
  consecutiveErrors: number;
  lastSyncedAt: string | null;
  metadata: Record<string, any> | null;
  connectedById: string | null;
}

export interface UserIntegration {
  provider: UserIntegrationProvider;
  isActive: boolean;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  consecutiveErrors: number;
  calendarId: string | null;
}

export interface IntegrationsListResponse {
  teamIntegrations: TeamIntegration[];
  userIntegrations: UserIntegration[];
}

export interface ProviderOption {
  id: string;
  name: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string | null;
  meetingUrl: string | null;
  platform: string | null;
  isValid: boolean;
}
