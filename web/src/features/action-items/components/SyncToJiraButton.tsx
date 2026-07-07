"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useSyncToJira } from "../hooks/useSyncToJira";
import { SyncStatusBadge } from "./SyncStatusBadge";
import type { ActionItem } from "../types";

const JiraIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M11.583 1.996h-.062c-.752.012-1.464.442-1.815 1.109L6.113 9.77a.64.64 0 0 0 .567.957h2.955a.64.64 0 0 1 .567.957l-3.593 6.663c-.352.668-.066 1.488.625 1.796l8.847 3.861c.42.183.896.117 1.25-.164a1.86 1.86 0 0 0 .61-1.03l2.42-15.748a1.91 1.91 0 0 0-1.802-2.164z" />
  </svg>
);

interface SyncToJiraButtonProps {
  actionItem: ActionItem;
}

export function SyncToJiraButton({ actionItem }: SyncToJiraButtonProps) {
  const sync = useSyncToJira(actionItem.id);
  const [showNotConnected, setShowNotConnected] = useState(false);

  // If already synced, show the badge directly
  if (actionItem.jiraIssueId) {
    return <SyncStatusBadge status="synced" url={actionItem.jiraIssueUrl} />;
  }

  return (
    <Popover open={showNotConnected} onOpenChange={setShowNotConnected}>
      <PopoverTrigger asChild>
        <div>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                  disabled={sync.isPending}
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent row click navigation
                    sync.mutate(undefined, {
                      onError: (err: any) => {
                        const errCode = err?.response?.data?.error?.code;
                        if (errCode === "INTEGRATION_NOT_CONNECTED") {
                          setShowNotConnected(true);
                        }
                      },
                    });
                  }}
                >
                  {sync.isPending ? (
                    <span className="text-[10px] text-muted-foreground font-sans font-normal animate-pulse">Sync…</span>
                  ) : (
                    <JiraIcon className="h-3.5 w-3.5 text-blue-500/80 hover:text-blue-600 shrink-0" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Sync to Jira
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        className="w-64 p-3 bg-background border border-border rounded-lg shadow-md z-50 pointer-events-auto"
        onClick={(e) => e.stopPropagation()} // Prevent row click navigation
      >
        <h4 className="text-[13px] font-semibold text-foreground mb-1">Jira Not Connected</h4>
        <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
          Your workspace team has not connected a Jira integration yet. Set it up on the Integrations page.
        </p>
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowNotConnected(false)}
          >
            Dismiss
          </Button>
          <Button asChild size="sm" className="h-7 text-xs">
            <Link href="/integrations" onClick={() => setShowNotConnected(false)}>
              Connect Jira
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
