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
import { useJiraProjects } from "../hooks/useJiraProjects";
import { useConfigureJira } from "../hooks/useConfigureJira";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Constants (Day 58 §17)
//
// Issue types: hardcoded to the near-universal Jira defaults (Task/Story/Bug).
// A live GET /issuetype fetch per project is an acknowledged future refinement —
// the three defaults cover the overwhelming majority of real Jira configurations.
//
// Priority options: Vocaply's own 4-level enum rendered through the selector.
// ─────────────────────────────────────────────────────────────────────────────

const ISSUE_TYPES = [
  { value: "Task", label: "Task" },
  { value: "Story", label: "Story" },
  { value: "Bug", label: "Bug" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
] as const;

interface JiraProjectConfigFormProps {
  /** Pre-selected values from existing metadata (populated on edit/reconfigure) */
  initialProjectKey?: string;
  initialIssueType?: string;
  initialPriority?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * JiraProjectConfigForm — project key, issue type, and priority configuration.
 *
 * State machine for the project picker:
 *   loading → populated dropdown  (common path)
 *   loading → error               (API unreachable)
 *   populated → user selects      → form enabled
 *
 * Submit delegates to useConfigureJira() → PATCH /integrations/jira/configure.
 */
export function JiraProjectConfigForm({
  initialProjectKey = "",
  initialIssueType = "Task",
  initialPriority = "MEDIUM",
  onSuccess,
  onCancel,
}: JiraProjectConfigFormProps) {
  const [projectKey, setProjectKey] = useState(initialProjectKey);
  const [issueType, setIssueType] = useState(initialIssueType);
  const [priority, setPriority] = useState(initialPriority);
  const [formError, setFormError] = useState<string | null>(null);

  const { projects, isLoading: isLoadingProjects, error: projectsError, refetch } = useJiraProjects(true);
  const { configure, isConfiguring, error: configError } = useConfigureJira();

  // Sync initial values if they change (e.g. metadata reloads after reconnect)
  useEffect(() => {
    if (initialProjectKey) setProjectKey(initialProjectKey);
    if (initialIssueType) setIssueType(initialIssueType);
    if (initialPriority) setPriority(initialPriority);
  }, [initialProjectKey, initialIssueType, initialPriority]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!projectKey) {
      setFormError("Please select a Jira project.");
      return;
    }
    if (!issueType) {
      setFormError("Please select a default issue type.");
      return;
    }

    const success = await configure({
      projectKey,
      defaultIssueType: issueType,
      defaultPriority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
    });

    if (success) {
      onSuccess?.();
    }
  };

  const displayError = formError || configError;

  return (
    <form
      id="integration-config-form"
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      {/* Project Picker */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="jira-project-key"
            className="text-sm font-medium text-foreground"
          >
            Jira Project
          </Label>
          {projectsError && (
            <button
              type="button"
              onClick={refetch}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Retry loading projects"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>

        {isLoadingProjects ? (
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/30">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading projects…</span>
          </div>
        ) : projectsError ? (
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-destructive/30 bg-destructive/5">
            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
            <span className="text-xs text-destructive">Failed to load projects. Check your connection.</span>
          </div>
        ) : (
          <Select
            value={projectKey}
            onValueChange={setProjectKey}
            disabled={isConfiguring}
          >
            <SelectTrigger
              id="jira-project-key"
              className={cn(
                "h-9 text-sm font-sans",
                !projectKey && "text-muted-foreground"
              )}
            >
              <SelectValue placeholder="Select a project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.length === 0 ? (
                <div className="py-3 text-center text-xs text-muted-foreground">
                  No projects found. Ensure your Jira account has project access.
                </div>
              ) : (
                projects.map((p) => (
                  <SelectItem key={p.key} value={p.key} className="text-sm">
                    {p.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}

        <p className="text-xs text-muted-foreground">
          Action items will be created as tickets in this project.
        </p>
      </div>

      {/* Issue Type */}
      <div className="space-y-2">
        <Label
          htmlFor="jira-issue-type"
          className="text-sm font-medium text-foreground"
        >
          Default Issue Type
        </Label>
        <Select
          value={issueType}
          onValueChange={setIssueType}
          disabled={isConfiguring}
        >
          <SelectTrigger id="jira-issue-type" className="h-9 text-sm font-sans">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-sm">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          New tickets will be created with this type. You can change it per action item later.
        </p>
      </div>

      {/* Default Priority */}
      <div className="space-y-2">
        <Label
          htmlFor="jira-default-priority"
          className="text-sm font-medium text-foreground"
        >
          Default Priority{" "}
          <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Select
          value={priority}
          onValueChange={setPriority}
          disabled={isConfiguring}
        >
          <SelectTrigger id="jira-default-priority" className="h-9 text-sm font-sans">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-sm">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Overridden per-ticket by the action item's own priority level.
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
          disabled={isConfiguring || isLoadingProjects || !projectKey}
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
