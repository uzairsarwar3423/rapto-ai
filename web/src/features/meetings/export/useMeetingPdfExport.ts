"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/utils/logger";
import { generateMeetingPdf } from "./generateMeetingPdf";
import type { MeetingReport } from "./meetingReport";

export type PdfExportState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "ready"; url: string; filename: string; sizeBytes: number }
  | { status: "error"; message: string };

const GENERIC_ERROR =
  "We couldn't generate the PDF. Check your connection and try again.";

/**
 * Drives PDF generation for the export dialog:
 *   idle → generating → ready (object URL for preview + download) | error (retryable)
 *
 * - A newer `generate()` / `cancel()` supersedes an older run, so a slow, stale render can
 *   never overwrite a fresh result or resurrect a closed dialog.
 * - The object URL is revoked whenever it is replaced, cancelled or the component unmounts.
 */
export function useMeetingPdfExport() {
  const [state, setState] = useState<PdfExportState>({ status: "idle" });
  const runRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  const release = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const generate = useCallback(
    async (report: MeetingReport, filename: string) => {
      const run = ++runRef.current;
      release();
      setState({ status: "generating" });
      try {
        const blob = await generateMeetingPdf(report);
        if (run !== runRef.current) return; // superseded or cancelled
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setState({ status: "ready", url, filename, sizeBytes: blob.size });
      } catch (error) {
        if (run !== runRef.current) return;
        logger.error("Meeting PDF generation failed", error);
        setState({ status: "error", message: GENERIC_ERROR });
      }
    },
    [release]
  );

  /** Abort any run in flight and drop the generated file (used when the dialog closes). */
  const cancel = useCallback(() => {
    runRef.current += 1;
    release();
    setState({ status: "idle" });
  }, [release]);

  /** Save the generated file. No-op unless a PDF is ready. */
  const download = useCallback(() => {
    if (state.status !== "ready") return false;
    const link = document.createElement("a");
    link.href = state.url;
    link.download = state.filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }, [state]);

  useEffect(
    () => () => {
      runRef.current += 1;
      release();
    },
    [release]
  );

  return { state, generate, cancel, download };
}
