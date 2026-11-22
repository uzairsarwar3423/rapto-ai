import { format } from "date-fns";
import { PLATFORM_LABEL, formatDuration, getMeetingStatusLabel } from "../lib/meetingFormat";
import {
  hasSummaryContent,
  parseStructuredSummary,
  stripLeadingBulletChar,
} from "../lib/summary";
import type { MeetingDetail, StructuredSummary } from "../types";

/**
 * The PDF report model: everything the document renders, already normalised and formatted.
 * Built from the SAME MeetingDetail + summary the Overview displays — there is no second data source.
 */
export interface ReportTopic {
  title: string;
  points: string[];
}

export interface MeetingReport {
  title: string;
  platform: string;
  statusLabel: string;
  /** Whether the meeting finished successfully (drives the status dot colour). */
  isComplete: boolean;
  dateText: string;
  timeText: string;
  durationText: string;
  purpose: string;
  overview: string;
  keyTakeaways: string[];
  topics: ReportTopic[];
  conclusions: string[];
  decisions: string[];
  /** e.g. "Generated on November 15, 2026" */
  generatedText: string;
  /** BCP-47 tag for the PDF's language metadata. */
  language: string;
}

// ─── Glyph safety ────────────────────────────────────────────────────────────
// The embedded Inter subset covers Latin text and general punctuation. Anything outside it would
// render as an empty box, so decorative characters (emoji, etc.) are dropped, and genuinely
// non-Latin content (Urdu, Hindi, …) is detected so the UI can ask for the English view instead.

const SUPPORTED_GLYPHS =
  "\\u0009\\u000A\\u0020-\\u00FF\\u0131\\u0152\\u0153\\u02BB\\u02BC\\u02C6\\u02DA\\u02DC\\u2000-\\u2027\\u202F-\\u206F\\u2074\\u20AC\\u2122\\u2191\\u2193\\u2212\\u2215";
const UNSUPPORTED = new RegExp(`[^${SUPPORTED_GLYPHS}]`, "gu");
const ANY_LETTER = /\p{L}/gu;
const IS_UNSUPPORTED = new RegExp(`[^${SUPPORTED_GLYPHS}]`, "u");

/** Remove characters the embedded font cannot draw, and collapse stray whitespace. */
export function pdfSafe(text: string): string {
  return String(text ?? "")
    .replace(UNSUPPORTED, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([.,;:!?)])/g, "$1") // an emoji removed before punctuation would leave "word ."
    .trim();
}

/** Share (0–1) of letters in `text` that the embedded font cannot render. */
export function unsupportedLetterRatio(text: string): number {
  const letters = text.match(ANY_LETTER) ?? [];
  if (letters.length === 0) return 0;
  const bad = letters.filter((ch) => IS_UNSUPPORTED.test(ch)).length;
  return bad / letters.length;
}

// ─── Builders ────────────────────────────────────────────────────────────────

function cleanList(items: string[] | undefined): string[] {
  return (items ?? [])
    .map((item) => pdfSafe(stripLeadingBulletChar(String(item ?? ""))))
    .filter(Boolean);
}

/**
 * Build the report from the meeting and the summary being displayed (original or English translation).
 * `now` is injectable for deterministic tests.
 */
export function buildMeetingReport(
  meeting: MeetingDetail,
  summary: StructuredSummary | string | null | undefined,
  options: { language?: string; now?: Date } = {}
): MeetingReport {
  const structured = parseStructuredSummary(summary);
  const content = structured && hasSummaryContent(structured) ? structured : {};
  const when = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const validWhen = when && !Number.isNaN(when.getTime()) ? when : null;

  const topics: ReportTopic[] = (content.topics_discussed ?? [])
    .map((topic) => ({
      title: pdfSafe(topic?.topic ?? ""),
      points: cleanList(topic?.bullets),
    }))
    .filter((topic) => topic.title || topic.points.length > 0);

  return {
    title: pdfSafe(meeting.title) || "Untitled meeting",
    platform: PLATFORM_LABEL[meeting.platform] ?? "Meeting",
    statusLabel: getMeetingStatusLabel(meeting.status),
    isComplete: ["DONE", "RESOLVED", "EXTRACTED"].includes(String(meeting.status).toUpperCase()),
    dateText: validWhen ? format(validWhen, "EEEE, MMMM d, yyyy") : "",
    timeText: validWhen ? format(validWhen, "h:mm a") : "",
    durationText: meeting.durationMinutes ? formatDuration(meeting.durationMinutes) : "",
    purpose: pdfSafe(content.meeting_purpose ?? ""),
    overview: pdfSafe(content.overview ?? ""),
    keyTakeaways: cleanList(content.key_takeaways),
    topics,
    conclusions: cleanList(content.conclusions),
    decisions: cleanList(content.decisions),
    generatedText: `Generated on ${format(options.now ?? new Date(), "MMMM d, yyyy")}`,
    language: options.language || "en",
  };
}

/** True when there is at least one summary section to put in the document. */
export function hasReportContent(report: MeetingReport): boolean {
  return Boolean(
    report.purpose ||
      report.overview ||
      report.keyTakeaways.length ||
      report.topics.length ||
      report.conclusions.length ||
      report.decisions.length
  );
}

/**
 * Original Urdu / Hindi / etc. content can't be set in the embedded Latin font (and PDF text
 * shaping for those scripts needs a different pipeline). Measured on the text BEFORE sanitising,
 * so the UI can ask for the English view instead of exporting a document full of blanks.
 */
export const UNSUPPORTED_SCRIPT_THRESHOLD = 0.15;

/**
 * Build the report AND report whether the original text relied on glyphs the document can't render.
 */
export function prepareMeetingReport(
  meeting: MeetingDetail,
  summary: StructuredSummary | string | null | undefined,
  options: { language?: string; now?: Date } = {}
): { report: MeetingReport; unsupportedScript: boolean } {
  const structured = parseStructuredSummary(summary);
  const content = structured && hasSummaryContent(structured) ? structured : {};
  const rawText = [
    meeting.title,
    content.meeting_purpose,
    content.overview,
    ...(content.key_takeaways ?? []),
    ...(content.topics_discussed ?? []).flatMap((t) => [t?.topic, ...(t?.bullets ?? [])]),
    ...(content.conclusions ?? []),
    ...(content.decisions ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    report: buildMeetingReport(meeting, summary, options),
    unsupportedScript: unsupportedLetterRatio(rawText) > UNSUPPORTED_SCRIPT_THRESHOLD,
  };
}

// ─── Filename ────────────────────────────────────────────────────────────────

/**
 * "Q4 Roadmap Review!" on 2026-08-31 -> "Q4-Roadmap-Review-2026-08-31.pdf".
 * Safe on every filesystem: letters/numbers only, hyphen separated, length capped.
 */
export function buildPdfFilename(title: string, scheduledAt?: string | null): string {
  const base =
    String(title ?? "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "Meeting-Report";

  const when = scheduledAt ? new Date(scheduledAt) : null;
  const datePart = when && !Number.isNaN(when.getTime()) ? format(when, "yyyy-MM-dd") : "";
  return `${[base, datePart].filter(Boolean).join("-")}.pdf`;
}
