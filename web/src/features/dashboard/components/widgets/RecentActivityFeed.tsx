"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { CheckCircle2, ListPlus, Video, Radio, UserPlus, AlertCircle, RefreshCw } from "lucide-react";
import { useDashboardOverview } from "../../hooks/useDashboardOverview";
import { WidgetHeader } from "./WidgetHeader";
import { RelativeTime } from "@/shared/components/data-display/RelativeTime";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

const ICON_MAP = {
  COMMITMENT_FULFILLED: {
    icon: CheckCircle2,
    color: "text-success bg-success/10 border-success/20",
  },
  COMMITMENT_CREATED: {
    icon: ListPlus,
    color: "text-brand bg-brand/10 border-brand/20",
  },
  MEETING_RECORDED: {
    icon: Video,
    color: "text-error bg-error/10 border-error/20",
  },
  BOT_JOINED: {
    icon: Radio,
    color: "text-warning bg-warning/10 border-warning/20",
  },
  INVITE_SENT: {
    icon: UserPlus,
    color: "text-muted-foreground bg-muted/15 border-border",
  },
};

export function RecentActivityFeed() {
  const { data: activities, isLoading, isError, refetch } = useDashboardOverview(10);

  return (
    <Card className="col-span-12 md:col-span-8 bg-surface border-border/60">
      <WidgetHeader title="Recent Activity" />

      {isLoading && (
        <div className="h-[280px] overflow-hidden">
          <ul className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="h-6 w-6 rounded bg-border/40 shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4 bg-border/40" />
                  <Skeleton className="h-3 w-1/4 bg-border/40" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center h-[280px] px-4 text-center">
          <AlertCircle className="h-5 w-5 text-error mb-2 animate-bounce" />
          <p className="text-xs text-muted-foreground mb-3">Failed to load activity stream.</p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-foreground bg-surface border border-border hover:bg-surface-2 transition duration-120 cursor-pointer rounded-lg"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && (!activities || activities.length === 0) && (
        <ScrollArea className="h-[280px]">
          <div className="flex flex-col items-center justify-center h-[280px] text-center px-4">
            <p className="text-xs text-muted-foreground">No activity yet</p>
          </div>
        </ScrollArea>
      )}

      {!isLoading && !isError && activities && activities.length > 0 && (
        <ScrollArea className="h-[280px]">
          <ul className="divide-y divide-border">
            {activities.map((act) => {
              const config = ICON_MAP[act.type] || ICON_MAP.INVITE_SENT;
              const ActIcon = config.icon;

              return (
                <li
                  key={act.id}
                  className="flex items-start gap-3 px-4 py-3"
                >
                  <div className={`flex items-center justify-center h-6 w-6 rounded border ${config.color} shrink-0 mt-0.5`}>
                    <ActIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-sans text-foreground">
                      <span className="font-semibold">{act.actorName}</span>{" "}
                      <span className="text-muted-foreground">{act.actionText}</span>
                    </p>
                    <p className="text-[11px] mt-0.5">
                      <RelativeTime date={act.occurredAt} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </Card>
  );
}
