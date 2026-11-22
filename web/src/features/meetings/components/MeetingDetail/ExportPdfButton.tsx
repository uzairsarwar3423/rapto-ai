"use client";

import React, { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExportPdfDialog } from "./ExportPdfDialog";
import { hasSummaryContent, parseStructuredSummary } from "../../lib/summary";
import { preloadMeetingPdf } from "../../export/generateMeetingPdf";
import type { MeetingDetail, StructuredSummary } from "../../types";

/**
 * Quiet "Export PDF" action for the Overview header. It exports exactly what the Overview is
 * showing right now (original or English translation); disabled until there is a summary.
 */
export function ExportPdfButton({
  meeting,
  summary,
  language,
  canSwitchToEnglish,
}: {
  meeting: MeetingDetail;
  summary: StructuredSummary | string | null | undefined;
  language: string;
  canSwitchToEnglish: boolean;
}) {
  const [open, setOpen] = useState(false);
  const structured = parseStructuredSummary(summary);
  const hasContent = !!structured && hasSummaryContent(structured);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!hasContent}
        onClick={() => setOpen(true)}
        // Warm the PDF engine + fonts the moment intent is clear, so the dialog opens onto a nearly-ready export.
        onPointerEnter={hasContent ? preloadMeetingPdf : undefined}
        onFocus={hasContent ? preloadMeetingPdf : undefined}
        onTouchStart={hasContent ? preloadMeetingPdf : undefined}
        title={hasContent ? "Export this report as a PDF" : "Available once the summary is ready"}
        className="h-8 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <FileDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        Export PDF
      </Button>

      {/* Mounted only when opened, so the PDF engine is never loaded for people who don't use it. */}
      {open && (
        <ExportPdfDialog
          open={open}
          onOpenChange={setOpen}
          meeting={meeting}
          summary={summary}
          language={language}
          canSwitchToEnglish={canSwitchToEnglish}
        />
      )}
    </>
  );
}
