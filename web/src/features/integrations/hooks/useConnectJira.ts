"use client";

import { useState } from "react";
import { toast } from "sonner";
import { initiateJiraConnectClient } from "../api/integrations.api";

/**
 * useConnectJira — initiates the Jira OAuth flow.
 *
 * Follows the same pattern as useConnectGoogleCalendar and useOAuthConnect:
 * full-page redirect (not XHR) because OAuth requires the browser to navigate
 * to Atlassian's consent screen — not something that can be done in an iframe
 * or via a fetch call.
 *
 * Flow:
 *   1. Call GET /integrations/jira/connect → receives { authUrl }
 *   2. window.location.href = authUrl → Atlassian consent screen
 *   3. After user approves: Atlassian → GET /integrations/jira/callback → 302 to frontend
 */
export function useConnectJira() {
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = async () => {
    setIsConnecting(true);
    try {
      const authUrl = await initiateJiraConnectClient();
      // Full-page navigation — same non-XHR OAuth pattern as calendar connect
      window.location.href = authUrl;
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message ||
          "Failed to initiate Jira connection. Please try again."
      );
      setIsConnecting(false);
    }
  };

  return { connect, isConnecting };
}
