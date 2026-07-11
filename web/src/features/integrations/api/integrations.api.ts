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

export async function syncCalendarNowClient(): Promise<{ synced: number, skipped: number, errors: string[] }> {
  const response = await api.post<{ success: boolean, data: { synced: number, skipped: number, errors: string[] } }>("/integrations/google-calendar/sync-now");
  return response.data.data;
}
