"use client";

import React from "react";
import { CommitmentScore } from "@/features/commitments/components/CommitmentScore/CommitmentScore";
import { CommitmentScoreLegend } from "@/features/commitments/components/CommitmentScore/CommitmentScoreLegend";
import type { TeamMember } from "../../types/team.types";

interface MemberScoreBreakdownProps {
  member: TeamMember;
}

export function MemberScoreBreakdown({ member }: MemberScoreBreakdownProps) {
  return (
    <section id="summary" className="scroll-mt-20">
      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-6 items-center p-5 rounded-2xl border border-border bg-surface-card shadow-sm select-none">
        {/* Large Gauge */}
        <div className="flex justify-center">
          <CommitmentScore score={member.commitmentScore} size="lg" />
        </div>

        {/* Breakdown Legend */}
        <div className="flex flex-col justify-center">
          <h3 className="font-plus-jakarta font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Performance Breakdown
          </h3>
          <CommitmentScoreLegend
            fulfillmentRate={member.fulfillmentRate}
            onTimeRate={member.onTimeRate}
            trend={member.trend}
          />
        </div>
      </div>
    </section>
  );
}
