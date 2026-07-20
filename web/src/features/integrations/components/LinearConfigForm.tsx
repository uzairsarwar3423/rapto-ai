"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { useLinearConfig } from "../hooks/useLinearConfig";
import { cn } from "@/lib/utils";

interface LinearConfigFormProps {
  initialTeamId?: string;
  initialStateId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function LinearConfigForm({
  initialTeamId = "",
  initialStateId = "",
  onSuccess,
  onCancel,
}: LinearConfigFormProps) {
  const [linearTeamId, setLinearTeamId] = useState(initialTeamId);
  const [defaultStateId, setDefaultStateId] = useState(initialStateId);
  const [formError, setFormError] = useState<string | null>(null);

  const { teams, isLoadingTeams, teamsError, refetchTeams, configure, isConfiguring, configureError } = useLinearConfig(true);

  // Sync initial values if they change
  useEffect(() => {
    if (initialTeamId) setLinearTeamId(initialTeamId);
    if (initialStateId) setDefaultStateId(initialStateId);
  }, [initialTeamId, initialStateId]);

  // Handle resetting stateId if selected team changes and old stateId is not in new team
  useEffect(() => {
    if (!linearTeamId) return;
    const selectedTeam = teams.find((t) => t.id === linearTeamId);
    if (selectedTeam && defaultStateId) {
      const stateExists = selectedTeam.states.some((s) => s.id === defaultStateId);
      if (!stateExists) {
        setDefaultStateId("");
      }
    }
  }, [linearTeamId, teams, defaultStateId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!linearTeamId) {
      setFormError("Please select a Linear team.");
      return;
    }
    if (!defaultStateId) {
      setFormError("Please select a default workflow state.");
      return;
    }

    const success = await configure({
      linearTeamId,
      defaultStateId,
    });

    if (success) {
      onSuccess?.();
    }
  };

  const displayError = formError || configureError;
  const selectedTeam = teams.find((t) => t.id === linearTeamId);
  const states = selectedTeam?.states || [];

  return (
    <form
      id="linear-config-form"
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      {/* Team Picker */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="linear-team-id"
            className="text-sm font-medium text-foreground"
          >
            Linear Team
          </Label>
          {teamsError && (
            <button
              type="button"
              onClick={refetchTeams}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Retry loading teams"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>

        {isLoadingTeams ? (
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/30">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading teams…</span>
          </div>
        ) : teamsError ? (
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-destructive/30 bg-destructive/5">
            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
            <span className="text-xs text-destructive">Failed to load teams. Check your connection.</span>
          </div>
        ) : (
          <Select
            value={linearTeamId}
            onValueChange={setLinearTeamId}
            disabled={isConfiguring}
          >
            <SelectTrigger
              id="linear-team-id"
              className={cn(
                "h-9 text-sm font-sans",
                !linearTeamId && "text-muted-foreground"
              )}
            >
              <SelectValue placeholder="Select a team…" />
            </SelectTrigger>
            <SelectContent>
              {teams.length === 0 ? (
                <div className="py-3 text-center text-xs text-muted-foreground">
                  No teams found. Ensure your Linear account has team access.
                </div>
              ) : (
                teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-sm">
                    {t.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}

        <p className="text-xs text-muted-foreground">
          Action items will be created as issues in this team.
        </p>
      </div>

      {/* Workflow State Picker */}
      <div className="space-y-2">
        <Label
          htmlFor="linear-state-id"
          className="text-sm font-medium text-foreground"
        >
          Default Workflow State
        </Label>
        <Select
          value={defaultStateId}
          onValueChange={setDefaultStateId}
          disabled={isConfiguring || !linearTeamId || isLoadingTeams}
        >
          <SelectTrigger id="linear-state-id" className="h-9 text-sm font-sans">
            <SelectValue placeholder={!linearTeamId ? "Select a team first" : "Select a workflow state…"} />
          </SelectTrigger>
          <SelectContent>
            {states.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-sm">
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          New issues will be created in this workflow state (e.g., Todo).
        </p>
      </div>

      {/* Validation / API error */}
      {displayError && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive leading-relaxed">{displayError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isConfiguring}
            className="h-9 text-xs font-sans"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={isConfiguring || isLoadingTeams || !linearTeamId || !defaultStateId}
          className="h-9 text-xs font-sans min-w-[100px]"
        >
          {isConfiguring ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving…
            </span>
          ) : (
            "Save Configuration"
          )}
        </Button>
      </div>
    </form>
  );
}
