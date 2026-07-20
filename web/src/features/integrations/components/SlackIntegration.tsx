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
  MessageSquare,
} from "lucide-react";
import { IntegrationIcon } from "./IntegrationIcon";
import { SlackConfigForm } from "./SlackConfigForm";
import { useConnectSlack } from "../hooks/useConnectSlack";
import { disconnectSlackClient } from "../api/integrations.api";
import type { TeamIntegration } from "../types";
import { cn } from "@/lib/utils";

type SlackState =
  | "NOT_CONNECTED"
  | "CONNECTED_UNCONFIGURED"
  | "CONNECTED_CONFIGURED"
  | "ERROR";

function resolveSlackState(integration: TeamIntegration | undefined | null): SlackState {
  if (!integration) return "NOT_CONNECTED";
  if (!integration.isActive) return "ERROR";

  const meta = integration.metadata as Record<string, any> | null;
  const hasChannel = !!(meta?.defaultChannelId);

  return hasChannel ? "CONNECTED_CONFIGURED" : "CONNECTED_UNCONFIGURED";
}

interface SlackIntegrationProps {
  integration: TeamIntegration | undefined | null;
  onRefresh?: () => void;
}

export function SlackIntegration({ integration, onRefresh }: SlackIntegrationProps) {
  const state = resolveSlackState(integration);
  const meta = (integration?.metadata as Record<string, any>) ?? {};

  const [configSheetOpen, setConfigSheetOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const { mutate: connect, isPending: isConnecting } = useConnectSlack();

  const handleConfigSuccess = () => {
    setConfigSheetOpen(false);
    onRefresh?.();
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectSlackClient();
      setDisconnectDialogOpen(false);
      onRefresh?.();
      toast.success("Slack disconnected successfully.");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message || "Failed to disconnect Slack. Please try again."
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "rounded-xl border bg-card p-5 transition-all duration-200",
          state === "ERROR" && "border-destructive/30 bg-destructive/5",
          state === "CONNECTED_CONFIGURED" && "border-emerald-200/50 dark:border-emerald-900/30",
          state === "NOT_CONNECTED" && "border-border/60 hover:border-border",
          state === "CONNECTED_UNCONFIGURED" && "border-amber-200/60 dark:border-amber-900/30"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0">
              <IntegrationIcon provider="SLACK" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground font-sans">Slack</span>
                <SlackStateBadge state={state} />
              </div>
              <p className="text-xs text-muted-foreground font-sans mt-0.5 leading-relaxed">
                Receive meeting summaries and commitment alerts directly in Slack.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {state === "NOT_CONNECTED" && (
              <Button
                size="sm"
                onClick={() => connect()}
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
                    Connect Slack
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
                onClick={() => connect()}
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

        {(state === "CONNECTED_CONFIGURED" || state === "CONNECTED_UNCONFIGURED") && integration && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground font-sans">
              {integration.workspaceName && (
                <span className="flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                  {integration.workspaceName}
                </span>
              )}
              {state === "CONNECTED_CONFIGURED" && meta.defaultChannelName && (
                <span className="flex items-center gap-1">
                  Channel:{" "}
                  <code className="bg-muted px-1 rounded text-foreground font-mono">
                    #{meta.defaultChannelName}
                  </code>
                </span>
              )}
              {integration.lastSyncedAt && (
                <span>
                  Last notified:{" "}
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

        {state === "ERROR" && (
          <div className="mt-3 pt-3 border-t border-destructive/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-destructive">Integration disabled after repeated failures</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Reconnect your Slack account to resume notifications. Your configuration will be preserved.
                </p>
              </div>
            </div>
          </div>
        )}

        {state === "CONNECTED_UNCONFIGURED" && (
          <div className="mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-900/30">
            <div className="flex items-start gap-2">
              <Settings className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Finish setup to start receiving notifications
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose a default Slack channel to activate meeting summaries.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <Sheet open={configSheetOpen} onOpenChange={(v) => !v && setConfigSheetOpen(false)}>
        <SheetContent
          className="sm:max-w-md flex flex-col h-full bg-background p-6"
          side="right"
        >
          <SheetHeader className="pb-5">
            <div className="flex items-center gap-3">
              <IntegrationIcon provider="SLACK" />
              <div>
                <SheetTitle className="text-base font-semibold font-heading">
                  Configure Slack Integration
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground mt-0.5 font-sans">
                  {integration?.workspaceName
                    ? `Connected to ${integration.workspaceName}`
                    : "Set up your Slack channel to receive notifications."}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <SlackConfigForm
              initialChannelId={meta.defaultChannelId ?? ""}
              initialChannelName={meta.defaultChannelName ?? ""}
              onSuccess={handleConfigSuccess}
              onCancel={() => setConfigSheetOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Disconnect Slack?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-sans leading-relaxed">
              This will revoke Vocaply&apos;s access to your Slack workspace and stop sending
              meeting summaries and commitment alerts. Your configuration will be removed.
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
                "Disconnect Slack"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SlackStateBadge({ state }: { state: SlackState }) {
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
