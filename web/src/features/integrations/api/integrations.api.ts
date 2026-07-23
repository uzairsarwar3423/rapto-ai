import { api } from "@/lib/api/client";
import type { 
  IntegrationsListResponse, 
  ProviderOption, 
  CalendarEvent 
} from "../types";

export async function fetchIntegrationsClient(): Promise<IntegrationsListResponse> {
  const response = await api.get<IntegrationsListResponse>("/integrations");
  return response.data;
}

export async function initiateOAuthConnectClient(provider: string): Promise<string> {
  const response = await api.get<{ authUrl: string }>(`/integrations/${provider}/connect`);
  return response.data.authUrl;
}

export async function disconnectTeamIntegrationClient(provider: string): Promise<void> {
  await api.delete(`/integrations/${provider}`);
}

export async function testTeamIntegrationClient(provider: string): Promise<{ healthy: boolean; workspaceName?: string; lastChecked: string }> {
  const response = await api.post<{ healthy: boolean; workspaceName?: string; lastChecked: string }>(`/integrations/${provider}/test`);
  return response.data;
}

export async function updateTeamIntegrationConfigClient(provider: string, config: Record<string, any>): Promise<any> {
  const response = await api.patch(`/integrations/${provider}/config`, { config });
  return response.data;
}

export async function fetchProviderOptionsClient(provider: string): Promise<ProviderOption[]> {
  const response = await api.get<{ options: ProviderOption[] }>(`/integrations/${provider}/options`);
  return response.data.options;
}

export async function testCalendarConnectionClient(provider: string): Promise<{ healthy: boolean; lastChecked: string }> {
  const response = await api.post<{ healthy: boolean; lastChecked: string }>(`/integrations/calendar/${provider}/test`);
  return response.data;
}

export async function disconnectCalendarClient(provider: string): Promise<void> {
  await api.delete(`/integrations/calendar/${provider}`);
}

export async function updateCalendarConfigClient(provider: string, config: Record<string, any>): Promise<any> {
  const response = await api.patch(`/integrations/calendar/${provider}/config`, { config });
  return response.data;
}

export async function fetchCalendarPreviewClient(): Promise<CalendarEvent[]> {
  const response = await api.get<{ events: CalendarEvent[] }>("/integrations/calendar/preview");
  return response.data.events;
}

export async function syncCalendarNowClient(provider: string = "GOOGLE_CALENDAR"): Promise<{ synced: number, skipped: number, errors: string[] }> {
  const endpoint = provider.toLowerCase().replace('_', '-');
  const response = await api.post<{ success: boolean, data: { synced: number, skipped: number, errors: string[] } }>(`/integrations/${endpoint}/sync-now`);
  return response.data.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// JIRA-SPECIFIC API FUNCTIONS (Day 58 §24)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /integrations/jira/connect → { authUrl } → navigate to Atlassian consent */
export async function initiateJiraConnectClient(): Promise<string> {
  const response = await api.get<{ success: boolean; data: { authUrl: string } }>("/integrations/jira/connect");
  return response.data.data.authUrl;
}

/** GET /integrations/jira/projects → { projects: [{key, name}] } */
export async function fetchJiraProjectsClient(): Promise<Array<{ key: string; name: string }>> {
  const response = await api.get<{ success: boolean; data: { projects: Array<{ key: string; name: string }> } }>("/integrations/jira/projects");
  return response.data.data.projects;
}

/** PATCH /integrations/jira/configure — set project key + issue type */
export async function configureJiraClient(config: {
  projectKey: string;
  defaultIssueType: string;
  defaultPriority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}): Promise<{ success: boolean; data: { metadata: Record<string, any> } }> {
  const response = await api.patch<{ success: boolean; data: { metadata: Record<string, any> } }>("/integrations/jira/configure", config);
  return response.data;
}

/** DELETE /integrations/jira — revoke token and delete row */
export async function disconnectJiraClient(): Promise<void> {
  await api.delete("/integrations/jira");
}

/** POST /action-items/:id/sync — enqueue a Jira sync job for a specific action item */
export async function syncActionItemToJiraClient(
  actionItemId: string,
  idempotencyKey: string
): Promise<{ provider: string; status: string; queuedAt: string }> {
  const response = await api.post<{ success: boolean; data: { provider: string; status: string; queuedAt: string } }>(
    `/action-items/${actionItemId}/sync`,
    { provider: 'JIRA' },
    { headers: { 'Idempotency-Key': idempotencyKey } }
  );
  return response.data.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLACK-SPECIFIC API FUNCTIONS (Day 60)
// ─────────────────────────────────────────────────────────────────────────────

export async function initiateSlackConnectClient(): Promise<string> {
  const response = await api.get<{ success: boolean; data: { authUrl: string } }>("/integrations/slack/connect");
  return response.data.data.authUrl;
}

export async function fetchSlackChannelsClient(): Promise<Array<{ id: string; name: string }>> {
  const response = await api.get<{ success: boolean; data: { channels: Array<{ id: string; name: string }> } }>("/integrations/slack/channels");
  return response.data.data.channels;
}

export async function configureSlackClient(config: {
  defaultChannelId: string;
  defaultChannelName: string;
}): Promise<{ success: boolean; data: { metadata: Record<string, any> } }> {
  const response = await api.patch<{ success: boolean; data: { metadata: Record<string, any> } }>("/integrations/slack/configure", config);
  return response.data;
}

export async function disconnectSlackClient(): Promise<void> {
  await api.delete("/integrations/slack");
}

export async function testSlackNotificationClient(): Promise<{ results: { channel: string; success: boolean; error?: string }[] }> {
  const response = await api.post<{ success: boolean; data: { results: { channel: string; success: boolean; error?: string }[] } }>("/notifications/test", { channel: 'slack' });
  return response.data.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// LINEAR-SPECIFIC API FUNCTIONS (Day 61)
// ─────────────────────────────────────────────────────────────────────────────

export async function initiateLinearConnectClient(): Promise<string> {
  const response = await api.get<{ success: boolean; data: { authUrl: string } }>("/integrations/linear/connect");
  return response.data.data.authUrl;
}

export async function fetchLinearTeamsClient(): Promise<Array<{ id: string; name: string; states: Array<{ id: string; name: string; type: string }> }>> {
  const response = await api.get<{ success: boolean; data: { teams: Array<{ id: string; name: string; states: Array<{ id: string; name: string; type: string }> }> } }>("/integrations/linear/teams");
  return response.data.data.teams;
}

export async function configureLinearClient(config: {
  linearTeamId: string;
  defaultStateId: string;
}): Promise<{ success: boolean; data: { metadata: Record<string, any> } }> {
  const response = await api.patch<{ success: boolean; data: { metadata: Record<string, any> } }>("/integrations/linear/configure", config);
  return response.data;
}

export async function disconnectLinearClient(): Promise<void> {
  await api.delete("/integrations/linear");
}

