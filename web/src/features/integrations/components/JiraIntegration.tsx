"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  RefreshCw,
  Settings,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Link,
} from "lucide-react";
import { IntegrationIcon } from "./IntegrationIcon";
import { JiraProjectConfigForm } from "./JiraProjectConfigForm";
import { useConnectJira } from "../hooks/useConnectJira";
import { useConfigureJira } from "../hooks/useConfigureJira";
import { disconnectJiraClient } from "../api/integrations.api";
import type { TeamIntegration } from "../types";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// JiraIntegration — 4-state integration card (Day 58 §17)
//
// State machine:
//   NOT_CONNECTED     → no integration row in DB
//   CONNECTED_UNCFG   → OAuth done, no projectKey configured yet
//   CONNECTED_CFG     → fully operational (isActive=true, projectKey set)
//   ERROR             → isActive=false, lastError present (needs reconnect)
// ─────────────────────────────────────────────────────────────────────────────

type JiraState =
  | "NOT_CONNECTED"
  | "CONNECTED_UNCONFIGURED"
  | "CONNECTED_CONFIGURED"
  | "ERROR";

function resolveJiraState(integration: TeamIntegration | undefined | null): JiraState {
  if (!integration) return "NOT_CONNECTED";
  if (!integration.isActive) return "ERROR";

  const meta = integration.metadata as Record<string, any> | null;
  const hasProjectKey = !!(meta?.projectKey);

  return hasProjectKey ? "CONNECTED_CONFIGURED" : "CONNECTED_UNCONFIGURED";
}

interface JiraIntegrationProps {
  /** The team's Jira integration row, or null/undefined if not connected */
  integration: TeamIntegration | undefined | null;
  /** Called after any state-changing action so the parent can refetch */
  onRefresh?: () => void;
}

export function JiraIntegration({ integration, onRefresh }: JiraIntegrationProps) {
  const state = resolveJiraState(integration);
  const meta = (integration?.metadata as Record<string, any>) ?? {};

  const [configSheetOpen, setConfigSheetOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const { connect, isConnecting } = useConnectJira();

  const handleConfigSuccess = () => {
    setConfigSheetOpen(false);
    onRefresh?.();
    toast.success("Jira configured — action items will now sync as tickets.");
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectJiraClient();
      setDisconnectDialogOpen(false);
      onRefresh?.();
      toast.success("Jira disconnected. Your historical tickets are preserved.");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message || "Failed to disconnect Jira. Please try again."
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <>
      {/* ── Integration Card ── */}
      <div
        className={cn(
          "rounded-xl border bg-card p-5 transition-all duration-200",
          state === "ERROR" && "border-destructive/30 bg-destructive/5",
          state === "CONNECTED_CONFIGURED" && "border-emerald-200/50 dark:border-emerald-900/30",
          state === "NOT_CONNECTED" && "border-border/60 hover:border-border",
          state === "CONNECTED_UNCONFIGURED" && "border-amber-200/60 dark:border-amber-900/30"
        )}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0">
              <IntegrationIcon provider="JIRA" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground font-sans">Jira</span>
                <JiraStateBadge state={state} />
              </div>
              <p className="text-xs text-muted-foreground font-sans mt-0.5 leading-relaxed">
                Sync action items from meetings as Jira tickets — automatically.
              </p>
            </div>
          </div>

          {/* Action area */}
          <div className="shrink-0">
            {state === "NOT_CONNECTED" && (
              <Button
                size="sm"
                onClick={connect}
                disabled={isConnecting}
                className="h-8 text-xs font-sans gap-1.5"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Link className="w-3.5 h-3.5" />
                    Connect Jira
                  </>
                )}
              </Button>
            )}

            {(state === "CONNECTED_UNCONFIGURED" || state === "CONNECTED_CONFIGURED") && (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfigSheetOpen(true)}
                  className="h-8 text-xs font-sans gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {state === "CONNECTED_UNCONFIGURED" ? "Finish Setup" : "Reconfigure"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDisconnectDialogOpen(true)}
                  className="h-8 text-xs font-sans gap-1.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {state === "ERROR" && (
              <Button
                size="sm"
                variant="outline"
                onClick={connect}
                disabled={isConnecting}
                className="h-8 text-xs font-sans gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Reconnecting…
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reconnect
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Connected metadata */}
        {(state === "CONNECTED_CONFIGURED" || state === "CONNECTED_UNCONFIGURED") && integration && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground font-sans">
              {integration.workspaceName && (
                <span className="flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                  {integration.workspaceName}
                </span>
              )}
              {state === "CONNECTED_CONFIGURED" && meta.projectKey && (
                <span className="flex items-center gap-1">
                  Project:{" "}
                  <code className="bg-muted px-1 rounded text-foreground font-mono">
                    {meta.projectKey}
                  </code>
                </span>
              )}
              {state === "CONNECTED_CONFIGURED" && meta.defaultIssueType && (
                <span>Issue type: {meta.defaultIssueType}</span>
              )}
              {integration.lastSyncedAt && (
                <span>
                  Last synced:{" "}
                  {new Date(integration.lastSyncedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error state details */}
        {state === "ERROR" && (
          <div className="mt-3 pt-3 border-t border-destructive/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-destructive">Integration disabled after repeated failures</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Reconnect your Jira account to resume ticket syncing. Your project configuration will be preserved.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Unconfigured prompt */}
        {state === "CONNECTED_UNCONFIGURED" && (
          <div className="mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-900/30">
            <div className="flex items-start gap-2">
              <Settings className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Finish setup to start syncing
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose a Jira project and default issue type to activate ticket creation.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Configuration Sheet ── */}
      <Sheet open={configSheetOpen} onOpenChange={(v) => !v && setConfigSheetOpen(false)}>
        <SheetContent
          className="sm:max-w-md flex flex-col h-full bg-background p-6"
          side="right"
        >
          <SheetHeader className="pb-5">
            <div className="flex items-center gap-3">
              <IntegrationIcon provider="JIRA" />
              <div>
                <SheetTitle className="text-base font-semibold font-heading">
                  Configure Jira Integration
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground mt-0.5 font-sans">
                  {integration?.workspaceName
                    ? `Connected to ${integration.workspaceName}`
                    : "Set up your Jira project to start syncing action items as tickets."}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <JiraProjectConfigForm
              initialProjectKey={meta.projectKey ?? ""}
              initialIssueType={meta.defaultIssueType ?? "Task"}
              initialPriority={meta.defaultPriority ?? "MEDIUM"}
              onSuccess={handleConfigSuccess}
              onCancel={() => setConfigSheetOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Disconnect Confirmation Dialog ── */}
      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Disconnect Jira?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-sans leading-relaxed">
              This will revoke Vocaply&apos;s access to your Jira workspace and stop syncing
              action items as tickets. Your project configuration will be removed.
              <br />
              <br />
              <strong>Tickets already created in Jira are not affected</strong> — they remain
              linked in Vocaply&apos;s history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnecting} className="font-sans text-sm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="bg-destructive hover:bg-destructive/90 font-sans text-sm"
            >
              {isDisconnecting ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Disconnecting…
                </span>
              ) : (
                "Disconnect Jira"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JiraStateBadge — visual state indicator
// ─────────────────────────────────────────────────────────────────────────────

function JiraStateBadge({ state }: { state: JiraState }) {
  switch (state) {
    case "NOT_CONNECTED":
      return (
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal normal-case tracking-normal">
          Not connected
        </Badge>
      );
    case "CONNECTED_UNCONFIGURED":
      return (
        <Badge
          variant="outline"
          className="text-[10px] h-5 px-1.5 font-normal normal-case tracking-normal border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
        >
          Setup required
        </Badge>
      );
    case "CONNECTED_CONFIGURED":
      return (
        <Badge
          variant="fulfilled"
          className="text-[10px] h-5 px-1.5 font-normal normal-case tracking-normal gap-1"
        >
          <CheckCircle2 className="w-2.5 h-2.5" />
          Active
        </Badge>
      );
    case "ERROR":
      return (
        <Badge
          variant="missed"
          className="text-[10px] h-5 px-1.5 font-normal normal-case tracking-normal"
        >
          Needs reconnect
        </Badge>
      );
    default:
      return null;
  }
}
