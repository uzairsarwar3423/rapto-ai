"use client";

import React from "react";
import { Clock, Users } from "lucide-react";
import { MeetingSummaryBlock } from "./MeetingSummaryBlock";
import { MeetingParticipantsList } from "./MeetingParticipantsList";
import { MeetingTimeline } from "./MeetingTimeline";
import { MeetingLanguageToggle } from "./MeetingLanguageToggle";
import { ExportPdfButton } from "./ExportPdfButton";
import { SectionLabel } from "./SectionLabel";
import { useMeetingDetail } from "../../hooks/useMeetingDetail";
import { isRtlLanguage, useMeetingLanguageView } from "../../hooks/useMeetingLanguage";
import type { MeetingDetail } from "../../types";

export function MeetingOverviewTab({ meeting: initialMeeting }: { meeting: MeetingDetail }) {
  const { data: meeting } = useMeetingDetail(initialMeeting.id, initialMeeting);
  const currentMeeting = meeting || initialMeeting;
  const { translation, sourceLanguage, canTranslate } = useMeetingLanguageView(currentMeeting.id);

  // Original stays the source of truth; the translation (if selected and ready) only replaces
  // what is displayed. While it generates — or if it fails — the original keeps rendering, never a blank card.
  const translatedSummary = translation?.summary ?? null;
  const showingOriginal = !translatedSummary;
  const displayLang = showingOriginal ? sourceLanguage : "en";
  const displayedSummary = translatedSummary ?? currentMeeting.summary;
  const participants = currentMeeting.participants || [];

  return (
    <div className="mt-8 grid grid-cols-1 gap-y-14 pb-16 sm:mt-10 lg:grid-cols-12 lg:gap-x-12">
      {/* ── Main column: the meeting report, set directly on the page (no card chrome) ── */}
      <div className="min-w-0 lg:col-span-8">
        <MeetingSummaryBlock
          summary={displayedSummary}
          headerAction={
            <div className="flex items-center gap-2">
              <MeetingLanguageToggle meetingId={currentMeeting.id} />
              <ExportPdfButton
                meeting={currentMeeting}
                summary={displayedSummary}
                language={displayLang}
                canSwitchToEnglish={canTranslate}
              />
            </div>
          }
          rtl={showingOriginal && isRtlLanguage(sourceLanguage)}
          lang={displayLang}
        />
      </div>

      {/* ── Side column: compact participants + timeline, separated by a hairline ── */}
      <aside className="min-w-0 lg:col-span-4" aria-label="Meeting details">
        <div className="grid gap-10 border-t border-border/60 pt-10 sm:grid-cols-2 lg:sticky lg:top-6 lg:grid-cols-1 lg:border-s lg:border-t-0 lg:ps-10 lg:pt-0">
          {participants.length > 0 && (
            <section aria-label="Participants">
              <SectionLabel icon={Users} count={participants.length}>
                Participants
              </SectionLabel>
              <MeetingParticipantsList participants={participants} />
            </section>
          )}

          <section aria-label="Timeline">
            <SectionLabel icon={Clock}>Timeline</SectionLabel>
            <MeetingTimeline meeting={currentMeeting} />
          </section>
        </div>
      </aside>
    </div>
  );
}
