"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { AlertCircle, Check, FileText, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildPdfFilename, hasReportContent, prepareMeetingReport } from "../../export/meetingReport";
import { useMeetingPdfExport } from "../../export/useMeetingPdfExport";
import type { MeetingDetail, StructuredSummary } from "../../types";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Purpose · Overview · 5 takeaways · 4 topics · 3 conclusions" — what will be in the file. */
function describeContents(report: ReturnType<typeof prepareMeetingReport>["report"]): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    report.purpose && "Purpose",
    report.overview && "Overview",
    report.keyTakeaways.length > 0 && plural(report.keyTakeaways.length, "takeaway", "takeaways"),
    report.topics.length > 0 && plural(report.topics.length, "topic", "topics"),
    report.conclusions.length > 0 && plural(report.conclusions.length, "conclusion", "conclusions"),
    report.decisions.length > 0 && plural(report.decisions.length, "decision", "decisions"),
  ]
    .filter(Boolean)
    .join("  ·  ");
}

interface ExportPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: MeetingDetail;
  /** The summary currently displayed in the Overview (original or English translation). */
  summary: StructuredSummary | string | null | undefined;
  /** Language of what is displayed ("en" | "ur" | "hi" …). */
  language: string;
  /** Whether an English translation can be selected from the Overview. */
  canSwitchToEnglish: boolean;
}

/**
 * Lightweight export dialog: generates the report from the data currently shown on the Overview,
 * previews the real PDF, then downloads on confirmation.
 */
export function ExportPdfDialog({
  open,
  onOpenChange,
  meeting,
  summary,
  language,
  canSwitchToEnglish,
}: ExportPdfDialogProps) {
  const { state, generate, cancel, download } = useMeetingPdfExport();

  const { report, unsupportedScript } = useMemo(
    () => prepareMeetingReport(meeting, summary, { language }),
    [meeting, summary, language]
  );
  const filename = useMemo(
    () => buildPdfFilename(report.title, meeting.scheduledAt),
    [report.title, meeting.scheduledAt]
  );
  const exportable = hasReportContent(report) && !unsupportedScript;

  // Key generation on the report's CONTENT, not object identity: a background refetch that returns an
  // identical meeting must not restart the PDF (and flash the preview).
  const reportKey = useMemo(() => JSON.stringify(report), [report]);
  const latest = useRef({ report, filename });
  latest.current = { report, filename };

  // Generate when the dialog opens (or the content genuinely changes); throw the file away when it closes.
  useEffect(() => {
    if (open && exportable) {
      void generate(latest.current.report, latest.current.filename);
    }
    if (!open) cancel();
  }, [open, exportable, reportKey, filename, generate, cancel]);

  const handleDownload = () => {
    if (download()) toast.success("PDF downloaded");
  };

  const retry = () => void generate(latest.current.report, latest.current.filename);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 bg-white p-5 text-foreground sm:max-w-3xl sm:p-6 dark:bg-background">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold tracking-tight">Export as PDF</DialogTitle>
          <DialogDescription className="text-[13px]">
            A formatted A4 report of this meeting&apos;s AI summary.
          </DialogDescription>
        </DialogHeader>

        {/* Not exportable: say why, and what to do */}
        {!exportable && (
          <div role="status" className="flex gap-3 rounded-lg border border-border/70 bg-foreground/[0.03] p-4 text-[13px] leading-relaxed">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-foreground/85">
              {unsupportedScript
                ? canSwitchToEnglish
                  ? "PDF export currently supports English and other Latin-script content. Switch the summary to English (the Original / English toggle above the report), then export."
                  : "PDF export currently supports English and other Latin-script content, and this summary uses a script it can't render yet."
                : "There's no summary to export yet. It appears here once the meeting finishes processing."}
            </p>
          </div>
        )}

        {exportable && (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
            {/* Preview (the real PDF). Hidden on small screens, where inline PDF viewers are unreliable. */}
            <div className="relative hidden aspect-[1/1.2] overflow-hidden rounded-lg border border-border/70 bg-foreground/[0.03] md:block">
              {state.status === "ready" ? (
                <iframe
                  title="PDF preview"
                  src={`${state.url}#toolbar=0&navpanes=0&view=FitH`}
                  className="h-full w-full bg-white"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
                  {state.status === "error" ? (
                    <AlertCircle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <span>{state.status === "error" ? "Preview unavailable" : "Preparing preview…"}</span>
                </div>
              )}
            </div>

            {/* File details + state */}
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex items-start gap-3 rounded-lg border border-border/70 p-3.5">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="break-all text-[13px] font-medium leading-snug text-foreground">{filename}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF · A4
                    {state.status === "ready" ? ` · ${formatSize(state.sizeBytes)}` : ""}
                  </p>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">{describeContents(report)}</p>

              <div aria-live="polite" className="min-h-6 text-[13px]">
                {state.status === "generating" && (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Generating your report…
                  </span>
                )}
                {state.status === "ready" && (
                  <span className="inline-flex items-center gap-2 text-foreground/80">
                    <Check className="h-3.5 w-3.5 text-brand" strokeWidth={2.25} aria-hidden="true" />
                    Ready to download
                  </span>
                )}
                {state.status === "error" && (
                  <div role="alert" className="space-y-3">
                    <span className="inline-flex items-start gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {state.message}
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={retry}>
                      <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Try again
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="-mx-5 -mb-5 bg-transparent px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="ink"
            className="min-w-[132px]"
            disabled={state.status !== "ready"}
            aria-busy={state.status === "generating"}
            onClick={handleDownload}
          >
            {state.status === "generating" ? "Generating…" : "Download PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
