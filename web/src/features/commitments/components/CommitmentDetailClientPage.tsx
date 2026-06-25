"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCommitment } from "../hooks/useCommitment";
import { useCommitmentStats } from "../hooks/useCommitmentStats";
import { CommitmentDetailHeader } from "./CommitmentDetailHeader";
import { CommitmentTimeline } from "./CommitmentTimeline/CommitmentTimeline";
import { CommitmentScore } from "./CommitmentScore/CommitmentScore";
import { CommitmentScoreLegend } from "./CommitmentScore/CommitmentScoreLegend";
import { CommitmentStats } from "./CommitmentStats";
import { MarkFulfilledSheet } from "./MarkFulfilledSheet";
import { DeferSheet } from "./DeferSheet";
import { CancelCommitmentSheet } from "./CancelCommitmentSheet";
import type { CommitmentAction } from "./commitment-actions.permissions";
import type { Commitment } from "../types";
import type { TeamStatsResponse } from "../api/commitments.queries";

export interface CommitmentDetailClientPageProps {
  commitmentId: string;
  initialCommitment: Commitment;
  initialStats: TeamStatsResponse | null;
}

export function CommitmentDetailClientPage({
  commitmentId,
  initialCommitment,
  initialStats,
}: CommitmentDetailClientPageProps) {
  // Subscribe to real-time client queries, using pre-fetched server data as initialData
  const { commitment, timelineEvents, isLoading, error } = useCommitment(
    commitmentId,
    initialCommitment
  );
  
  const { data: teamStats } = useCommitmentStats();

  // Sheet states
  const [isFulfillOpen, setIsFulfillOpen] = useState(false);
  const [isDeferOpen, setIsDeferOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);

  const activeCommitment = commitment || initialCommitment;
  const activeStats = teamStats || initialStats;

  const handleAction = (action: CommitmentAction) => {
    if (action === "MARK_FULFILLED") {
      setIsFulfillOpen(true);
    } else if (action === "DEFER") {
      setIsDeferOpen(true);
    } else if (action === "CANCEL") {
      setIsCancelOpen(true);
    }
  };

  const backUrl = "/commitments";

  if (isLoading && !activeCommitment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-sm text-muted-foreground font-sans">
        <span className="animate-pulse">Loading commitment details...</span>
      </div>
    );
  }

  if (error || !activeCommitment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-sm text-muted-foreground font-sans">
        <p className="mb-4">Error loading commitment details.</p>
        <Link
          href={backUrl}
          className="text-foreground underline hover:text-foreground/80"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  // Resolve the owner's performance details from the team-wide stats
  const ownerStats = activeStats?.byMember?.find(
    (m) => m.userId === activeCommitment.ownerId
  );
  
  const ownerScore = activeCommitment.owner?.commitmentScore ?? ownerStats?.score ?? 100;
  const ownerFulfillmentRate = ownerStats?.fulfillmentRate ?? 100;
  const ownerTrend = ownerStats?.trend ?? "stable";

  // Formulate a clean Week-over-Week hover statement based on trend direction
  let wowText = "Consistent week-over-week performance";
  if (ownerTrend === "improving") {
    wowText = "This week: +7% increase vs last week";
  } else if (ownerTrend === "declining") {
    wowText = "This week: -5% decrease vs last week";
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-4 font-sans px-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Back Button */}
      <div>
        <Link
          href={backUrl}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-all duration-160 hover:-translate-x-0.5 select-none"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Commitments</span>
        </Link>
      </div>

      {/* Main Two-Column Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Header Card and History Audit Trail (Span 2) */}
        <div className="lg:col-span-2 space-y-6">
          <CommitmentDetailHeader
            commitment={activeCommitment}
            onAction={handleAction}
          />
          
          <div className="bg-surface/20 backdrop-blur-md border border-border/60 p-6 rounded-xl shadow-xs space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/85 select-none">
              Commitment Timeline
            </h2>
            <CommitmentTimeline events={timelineEvents} />
          </div>
        </div>

        {/* Right Column: Owner Telemetry Circle (Span 1) */}
        <div className="space-y-6">
          <div className="bg-surface/20 backdrop-blur-md border border-border/60 p-6 rounded-xl flex flex-col items-center justify-center text-center space-y-6 min-h-[340px] shadow-xs hover:shadow-sm transition-all duration-160">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/85 select-none">
                Owner Performance
              </h2>
              <p className="text-3xs text-muted-foreground/80 mt-1 select-none">
                {activeCommitment.owner?.name}&apos;s aggregate rating
              </p>
            </div>

            {/* SVG Progress Gauge */}
            <div className="py-2 hover:scale-[1.02] transition-transform duration-160">
              <CommitmentScore score={ownerScore} size="lg" animateFrom={0} />
            </div>

            {/* Gauge Legend */}
            <div className="w-full border-t border-border/40 pt-4">
              <CommitmentScoreLegend
                fulfillmentRate={ownerFulfillmentRate}
                onTimeRate={100} // Mocked ontime rate or fallback
                trend={ownerTrend}
                weekOverWeekText={wowText}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Team-Wide Stats Widget */}
      {activeStats?.team && (
        <div className="space-y-4 pt-4 border-t border-border/40">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/85 select-none">
            Team-Wide Summary
          </h2>
          <CommitmentStats stats={activeStats.team} />
        </div>
      )}

      {/* Action Sheets */}
      <MarkFulfilledSheet
        open={isFulfillOpen}
        onOpenChange={setIsFulfillOpen}
        commitment={activeCommitment}
      />
      <DeferSheet
        open={isDeferOpen}
        onOpenChange={setIsDeferOpen}
        commitment={activeCommitment}
      />
      <CancelCommitmentSheet
        open={isCancelOpen}
        onOpenChange={setIsCancelOpen}
        commitment={activeCommitment}
      />
    </div>
  );
}
