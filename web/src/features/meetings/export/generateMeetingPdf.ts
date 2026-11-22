import { createElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { MeetingReport } from "./meetingReport";
import { cachePdf, getCachedPdf, pdfCacheKey } from "./pdfCache";

/** Loads the PDF engine, the document and the font registration (one shared, cached import each). */
function loadPdfModules() {
  return Promise.all([
    import("@react-pdf/renderer"),
    import("./MeetingReportDocument"),
    import("./pdfFonts"),
  ]);
}

const FONT_WEIGHTS = [400, 500, 600, 700] as const;
let warmUp: Promise<void> | null = null;

/**
 * Get ready to export: download the engine chunk, register Inter, and fetch + parse its four weights
 * so the first real export doesn't pay for any of it. Call it on user INTENT (hover / focus / touch)
 * — never eagerly — so people who don't export never download the engine. Safe to call repeatedly.
 */
export function preloadMeetingPdf(): Promise<void> {
  if (!warmUp) {
    warmUp = (async () => {
      const [{ Font }, , { registerPdfFonts, PDF_FONT_FAMILY }] = await loadPdfModules();
      registerPdfFonts();
      await Promise.all(FONT_WEIGHTS.map((fontWeight) => Font.load({ fontFamily: PDF_FONT_FAMILY, fontWeight })));
    })().catch(() => {
      // A failed warm-up must not poison the real export: forget it and let generate() retry normally.
      warmUp = null;
    });
  }
  return warmUp;
}

/**
 * Render the report to a PDF Blob, entirely in the browser.
 *
 * The PDF engine, the document and the fonts are loaded lazily on first use, so they never
 * weigh on the normal page bundle — only people who click "Export PDF" pay for them.
 */
export async function generateMeetingPdf(report: MeetingReport): Promise<Blob> {
  // Same content as a recent export → reuse it (instant re-open, retry, language toggle back and forth).
  const key = pdfCacheKey(report);
  const cached = getCachedPdf(key);
  if (cached) return cached;

  const [{ pdf }, { MeetingReportDocument }, { registerPdfFonts }] = await loadPdfModules();

  registerPdfFonts();

  const element = createElement(MeetingReportDocument, { report }) as unknown as ReactElement<DocumentProps>;
  const blob = await pdf(element).toBlob();
  cachePdf(key, blob);
  return blob;
}
