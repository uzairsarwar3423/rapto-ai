"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Loader2, Radio, AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reprocessMeetingClient } from "../../api/meetings.queries";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/lib/cache/query-keys";
import { toast } from "sonner";
import type { MeetingDetail, MeetingStatus } from "../../types";

interface BotStatusBannerProps {
  meeting?: MeetingDetail;
  status?: MeetingStatus | string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}:${remMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function BotStatusBanner({ meeting, status: explicitStatus }: BotStatusBannerProps) {
  const queryClient = useQueryClient();
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const status = (meeting?.status || explicitStatus || "").toUpperCase();
  const startTimeStr = meeting?.recordingStartedAt || meeting?.startedAt;

  // Live timer for active recording
  useEffect(() => {
    if (status !== "RECORDING") {
      setElapsedSeconds(0);
      return;
    }

    const startTimestamp = startTimeStr ? new Date(startTimeStr).getTime() : Date.now();

    const updateTimer = () => {
      const diffSecs = Math.max(0, Math.floor((Date.now() - startTimestamp) / 1000));
      setElapsedSeconds(diffSecs);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [status, startTimeStr]);

  const handleReprocess = async () => {
    if (!meeting?.id || isReprocessing) return;
    setIsReprocessing(true);
    try {
      await reprocessMeetingClient(meeting.id);
      toast.success("Meeting reprocessing initiated. Re-extracting commitments and summary...");
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.meetings.detail(meeting.id) });
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.message || "Failed to reprocess");
    } finally {
      setIsReprocessing(false);
    }
  };

  if (
    status !== "BOT_JOINING" &&
    status !== "RECORDING" &&
    status !== "PROCESSING" &&
    status !== "FAILED"
  ) {
    return null;
  }

  if (status === "BOT_JOINING") {
    return (
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3.5 py-2.5 text-xs text-foreground shadow-xs animate-in fade-in slide-in-from-top-1 duration-300">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <span className="font-medium text-amber-900 dark:text-amber-300">
            Rapto bot is joining the audio bridge... Recording will begin automatically.
          </span>
        </div>
      </div>
    );
  }

  if (status === "RECORDING") {
    return (
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-red-500/30 bg-red-500/5 px-3.5 py-2.5 text-xs text-foreground shadow-xs animate-in fade-in slide-in-from-top-1 duration-300">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-600 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
          </span>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider text-[10px]">
              Live Recording
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="font-mono font-medium text-foreground text-xs">
              {formatDuration(elapsedSeconds)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Capturing transcript in real time
          </span>
          <Radio className="h-3.5 w-3.5 text-red-500 animate-pulse shrink-0" />
        </div>
      </div>
    );
  }

  if (status === "PROCESSING") {
    return (
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-indigo-500/25 bg-indigo-500/5 px-3.5 py-2.5 text-xs text-foreground shadow-xs animate-in fade-in slide-in-from-top-1 duration-300">
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
          <div>
            <span className="font-medium text-indigo-900 dark:text-indigo-300">
              AI Analysis In Progress
            </span>
            <span className="text-muted-foreground ml-1.5 hidden md:inline">
              Cleaning transcript, extracting commitments, action items & decisions...
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-medium text-[11px] self-end sm:self-auto">
          <Sparkles className="h-3 w-3 animate-pulse shrink-0" />
          <span className="hidden sm:inline">Live Pipeline</span>
        </div>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-red-500/30 bg-red-500/5 px-3.5 py-2.5 text-xs text-foreground shadow-xs animate-in fade-in slide-in-from-top-1 duration-300">
        <div className="flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
          <span className="text-red-800 dark:text-red-300 break-words">
            Processing failed{meeting?.processingError ? `: ${meeting.processingError}` : ""}
          </span>
        </div>
        {meeting?.id && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleReprocess}
            disabled={isReprocessing}
            className="h-7 text-xs gap-1.5 border-red-500/30 hover:bg-red-500/10 text-red-700 dark:text-red-300 self-end sm:self-auto cursor-pointer"
          >
            {isReprocessing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Retry Reprocess
          </Button>
        )}
      </div>
    );
  }

  return null;
}
