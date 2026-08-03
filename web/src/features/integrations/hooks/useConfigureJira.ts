"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { useAuthStore } from "@/features/auth/store/auth.store";
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

export function useConfigureJira(): UseConfigureJiraReturn {
  const queryClient = useQueryClient();
  const teamId = useAuthStore((state) => state.user?.teamId) || "";
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configure = async (input: ConfigureJiraInput): Promise<boolean> => {
    setIsConfiguring(true);
    setError(null);

    try {
      await configureJiraClient(input);
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all(teamId) });
      }
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
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
