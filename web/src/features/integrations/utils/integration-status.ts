import type { TeamIntegration, UserIntegration } from "../types";

export type IntegrationState =
  | "NOT_CONNECTED"
  | "SETUP_REQUIRED"
  | "CONNECTED"
  | "ERROR";

/**
 * Checks whether an integration has all required configuration parameters completed.
 * Scalable helper for Linear, Jira, Slack, Notion, and Calendar providers.
 */
export function isIntegrationConfigured(
  providerId: string,
  integration: TeamIntegration | UserIntegration | null | undefined
): boolean {
  if (!integration || !integration.isActive) return false;

  const meta = (integration as TeamIntegration).metadata as Record<string, any> | null;

  switch (providerId) {
    case "LINEAR":
      return !!(meta?.linearTeamId && meta?.defaultStateId);
    case "JIRA":
      return !!(meta?.projectKey);
    case "SLACK":
      return !!(meta?.channelId || meta?.defaultChannelId);
    case "NOTION":
      return !!(meta?.databaseId);
    case "GOOGLE_CALENDAR":
    case "OUTLOOK_CALENDAR":
      return true; // Calendar integrations are functional immediately upon OAuth connect
    default:
      return meta ? Object.keys(meta).length > 0 : true;
  }
}

/**
 * Resolves the UI lifecycle state for any provider.
 */
export function resolveIntegrationState(
  providerId: string,
  integration: TeamIntegration | UserIntegration | null | undefined
): IntegrationState {
  if (!integration || !integration.isActive) return "NOT_CONNECTED";
  if (integration.consecutiveErrors && integration.consecutiveErrors > 0) return "ERROR";
  
  const configured = isIntegrationConfigured(providerId, integration);
  return configured ? "CONNECTED" : "SETUP_REQUIRED";
}
