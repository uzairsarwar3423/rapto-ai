"use client";

import { useState, useEffect } from "react";
import { fetchJiraProjectsClient } from "../api/integrations.api";

export interface JiraProject {
  key: string;
  name: string;
}

interface UseJiraProjectsReturn {
  projects: JiraProject[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * useJiraProjects — fetches the team's Jira projects for the configuration dropdown.
 *
 * Only fetches when `enabled` is true (i.e., the Jira integration is already connected).
 * This prevents unnecessary API calls for teams that haven't connected Jira yet.
 *
 * Used by JiraProjectConfigForm.tsx (Day 58 §17) to populate the project-key dropdown.
 */
export function useJiraProjects(enabled = true): UseJiraProjectsReturn {
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refetch = () => setFetchCount((c) => c + 1);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchJiraProjectsClient()
      .then((data) => {
        if (!cancelled) {
          setProjects(data);
          setIsLoading(false);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          const message =
            err?.response?.data?.error?.message ||
            "Failed to load Jira projects. Ensure your Jira integration is connected.";
          setError(message);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fetchCount]);

  return { projects, isLoading, error, refetch };
}
