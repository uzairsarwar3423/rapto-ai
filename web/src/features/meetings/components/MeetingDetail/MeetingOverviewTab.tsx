"use client";

import React from "react";
import { MeetingSummaryBlock } from "./MeetingSummaryBlock";
import { MeetingParticipantsList } from "./MeetingParticipantsList";
import { MeetingTimeline } from "./MeetingTimeline";
import { Card } from "@/components/ui/card";
import { useMeetingDetail } from "../../hooks/useMeetingDetail";
import type { MeetingDetail } from "../../types";

export function MeetingOverviewTab({ meeting: initialMeeting }: { meeting: MeetingDetail }) {
  const { data: meeting } = useMeetingDetail(initialMeeting.id, initialMeeting);
  const currentMeeting = meeting || initialMeeting;

  return (
    <div className="mt-4 grid grid-cols-12 gap-4 lg:gap-6">
      {/* ── Main column: full structured summary ── */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
        <MeetingSummaryBlock summary={currentMeeting.summary} />
      </div>

      {/* ── Side column: participants + timeline ── */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
        <Card className="p-4 rounded-xl shadow-xs">
          <h3 className="mb-3 text-xs font-semibold text-foreground uppercase tracking-wider">Participants</h3>
          <MeetingParticipantsList participants={currentMeeting.participants || []} />
        </Card>
        <Card className="p-4 rounded-xl shadow-xs">
          <h3 className="mb-3 text-xs font-semibold text-foreground uppercase tracking-wider">Timeline</h3>
          <MeetingTimeline meeting={currentMeeting} />
        </Card>
      </div>
    </div>
  );
}
