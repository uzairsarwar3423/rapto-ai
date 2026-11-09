"use client";

import React from "react";
import { MeetingSummaryBlock } from "./MeetingSummaryBlock";
import { MeetingParticipantsList } from "./MeetingParticipantsList";
import { MeetingTimeline } from "./MeetingTimeline";
import { MeetingLanguageToggle } from "./MeetingLanguageToggle";
import { Card } from "@/components/ui/card";
import { useMeetingDetail } from "../../hooks/useMeetingDetail";
import { isRtlLanguage, useMeetingLanguageView } from "../../hooks/useMeetingLanguage";
import type { MeetingDetail } from "../../types";

export function MeetingOverviewTab({ meeting: initialMeeting }: { meeting: MeetingDetail }) {
  const { data: meeting } = useMeetingDetail(initialMeeting.id, initialMeeting);
  const currentMeeting = meeting || initialMeeting;
  const { translation, sourceLanguage } = useMeetingLanguageView(currentMeeting.id);

  // Original stays the source of truth; the translation (if selected and ready) only replaces
  // what is displayed. While it generates — or if it fails — the original keeps rendering, never a blank card.
  const translatedSummary = translation?.summary ?? null;
  const showingOriginal = !translatedSummary;
  const displayLang = showingOriginal ? sourceLanguage : "en";

  return (
    <div className="mt-4 grid grid-cols-12 gap-4 lg:gap-6">
      {/* ── Main column: full structured summary ── */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
        <MeetingSummaryBlock
          summary={translatedSummary ?? currentMeeting.summary}
          headerAction={<MeetingLanguageToggle meetingId={currentMeeting.id} />}
          rtl={showingOriginal && isRtlLanguage(sourceLanguage)}
          lang={displayLang}
        />
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
