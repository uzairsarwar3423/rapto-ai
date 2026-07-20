"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { fetchLinearTeamsClient, configureLinearClient } from "../api/integrations.api";

export interface LinearState {
  id: string;
  name: string;
  type: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  states: LinearState[];
}

export interface ConfigureLinearInput {
  linearTeamId: string;
  defaultStateId: string;
}

interface UseLinearConfigReturn {
  teams: LinearTeam[];
  isLoadingTeams: boolean;
  teamsError: string | null;
  refetchTeams: () => void;
  configure: (input: ConfigureLinearInput) => Promise<boolean>;
  isConfiguring: boolean;
  configureError: string | null;
}

export function useLinearConfig(enabled = true): UseLinearConfigReturn {
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configureError, setConfigureError] = useState<string | null>(null);

  const refetchTeams = () => setFetchCount((c) => c + 1);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setIsLoadingTeams(true);
    setTeamsError(null);

    fetchLinearTeamsClient()
      .then((data) => {
        if (!cancelled) {
          setTeams(data);
          setIsLoadingTeams(false);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          const message =
            err?.response?.data?.error?.message ||
            "Failed to load Linear teams. Ensure your Linear integration is connected.";
          setTeamsError(message);
          setIsLoadingTeams(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, fetchCount]);

  const configure = async (input: ConfigureLinearInput): Promise<boolean> => {
    setIsConfiguring(true);
    setConfigureError(null);

    try {
      await configureLinearClient(input);
      toast.success("Linear configuration saved. Action items will now sync to the configured team and state.");
      return true;
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        "Failed to save Linear configuration. Please check the inputs and try again.";
      setConfigureError(message);
      toast.error(message);
      return false;
    } finally {
      setIsConfiguring(false);
    }
  };

  return { teams, isLoadingTeams, teamsError, refetchTeams, configure, isConfiguring, configureError };
}
