"use client";

import { useState } from "react";
import { toast } from "sonner";
import { configureJiraClient } from "../api/integrations.api";

export interface ConfigureJiraInput {
  projectKey: string;
  defaultIssueType: string;
  defaultPriority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
}

interface UseConfigureJiraReturn {
  configure: (input: ConfigureJiraInput) => Promise<boolean>;
  isConfiguring: boolean;
  error: string | null;
}

/**
 * useConfigureJira — submits the Jira project configuration form.
 *
 * Calls PATCH /integrations/jira/configure with projectKey + defaultIssueType.
 * Returns `true` on success so the form can close the config sheet.
 *
 * Uses the server's JSONB merge-update — setting only projectKey never
 * clobbers an already-configured defaultIssueType (Day 58 §12).
 */
export function useConfigureJira(): UseConfigureJiraReturn {
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configure = async (input: ConfigureJiraInput): Promise<boolean> => {
    setIsConfiguring(true);
    setError(null);

    try {
      await configureJiraClient(input);
      toast.success("Jira configuration saved. Tickets will now sync to the configured project.");
      return true;
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        "Failed to save Jira configuration. Please check the project key and try again.";
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setIsConfiguring(false);
    }
  };

  return { configure, isConfiguring, error };
}
