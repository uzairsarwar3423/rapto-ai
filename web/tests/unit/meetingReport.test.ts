import { describe, expect, it } from "vitest";
import {
  buildMeetingReport,
  buildPdfFilename,
  hasReportContent,
  pdfSafe,
  prepareMeetingReport,
  unsupportedLetterRatio,
} from "@/features/meetings/export/meetingReport";
import { splitKeyPhrases } from "@/features/meetings/lib/summary";
import { formatDuration, getMeetingStatusLabel } from "@/features/meetings/lib/meetingFormat";
import type { MeetingDetail } from "@/features/meetings/types";

const NOW = new Date("2026-11-15T09:00:00Z");

function meeting(overrides: Partial<MeetingDetail> = {}): MeetingDetail {
  return {
    id: "m1",
    title: "Q4 Roadmap Review",
    platform: "GOOGLE_MEET",
    status: "DONE",
    scheduledAt: "2026-08-31T10:00:00.000Z",
    startedAt: null,
    endedAt: null,
    durationMinutes: 45,
    participantCount: 0,
    commitmentCount: 0,
    actionItemCount: 0,
    decisionCount: 0,
    summary: null,
    createdAt: "2026-08-30T10:00:00.000Z",
    participants: [],
    ...overrides,
  };
}

describe("buildPdfFilename", () => {
  it("builds Title-Words-YYYY-MM-DD.pdf", () => {
    const name = buildPdfFilename("Q4 Roadmap Review", "2026-08-31T10:00:00.000Z");
    expect(name).toMatch(/^Q4-Roadmap-Review-2026-08-3[01]\.pdf$/); // date is local-time
  });

  it("is filesystem-safe", () => {
    const name = buildPdfFilename('Budget: Q3/Q4 — "final"? <draft>*', "2026-08-31T10:00:00.000Z");
    expect(name).not.toMatch(/[\\/:*?"<>|\s]/);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("strips accents, caps length, and falls back when nothing usable remains", () => {
    expect(buildPdfFilename("Café Über Meeting", null)).toBe("Cafe-Uber-Meeting.pdf");
    expect(buildPdfFilename("x".repeat(300), null).length).toBeLessThanOrEqual(64);
    expect(buildPdfFilename("日本語 !!!", null)).toBe("Meeting-Report.pdf");
    expect(buildPdfFilename("", "not a date")).toBe("Meeting-Report.pdf");
  });
});

describe("pdfSafe", () => {
  it("keeps Latin text, accents, curly quotes, dashes and bullets", () => {
    const text = "Café “quoted” — 50% • Tomás – naïve…";
    expect(pdfSafe(text)).toBe(text);
  });

  it("drops emoji and tidies the space it leaves before punctuation", () => {
    expect(pdfSafe("Design handoff is on track 🚀.")).toBe("Design handoff is on track.");
    expect(pdfSafe("Ship it 🚀 now")).toBe("Ship it now");
  });
});

describe("unsupported script detection", () => {
  it("measures the share of letters the embedded font cannot draw", () => {
    expect(unsupportedLetterRatio("Plain English text")).toBe(0);
    expect(unsupportedLetterRatio("ٹیم نے منصوبے پر بات کی")).toBeGreaterThan(0.9);
    expect(unsupportedLetterRatio("")).toBe(0);
  });

  it("flags Urdu / Hindi summaries but not English ones", () => {
    const urdu = prepareMeetingReport(
      meeting({ title: "ہفتہ وار جائزہ" }),
      { overview: "ٹیم نے منصوبے پر بات کی اور فیصلے کیے۔", key_takeaways: ["سب کچھ ٹھیک ہے"] },
      { now: NOW }
    );
    expect(urdu.unsupportedScript).toBe(true);

    const english = prepareMeetingReport(meeting(), { overview: "The team agreed on the plan." }, { now: NOW });
    expect(english.unsupportedScript).toBe(false);
  });

  it("tolerates a few foreign words inside English text", () => {
    const mixed = prepareMeetingReport(
      meeting(),
      { overview: "The team discussed the Hindi term नमस्ते briefly and then moved on to the roadmap and launch plan." },
      { now: NOW }
    );
    expect(mixed.unsupportedScript).toBe(false);
  });
});

describe("buildMeetingReport", () => {
  const summary = {
    meeting_purpose: "Align on Q4.",
    overview: "We reviewed the roadmap.",
    key_takeaways: ["- Ship by Nov 20", "• Fix the blocker"],
    topics_discussed: [
      { topic: "Rollout", bullets: ["- Phase 1", "Phase 2"] },
      { topic: "", bullets: [] },
    ],
    conclusions: ["* Go ahead"],
    decisions: ["Use a feature flag"],
  };

  it("maps the displayed summary onto the report, with bullet characters stripped", () => {
    const report = buildMeetingReport(meeting(), summary, { now: NOW });
    expect(report.title).toBe("Q4 Roadmap Review");
    expect(report.platform).toBe("Google Meet");
    expect(report.statusLabel).toBe("Done");
    expect(report.isComplete).toBe(true);
    expect(report.durationText).toBe("45 min");
    expect(report.dateText).toMatch(/August 3[01], 2026$/);
    expect(report.purpose).toBe("Align on Q4.");
    expect(report.keyTakeaways).toEqual(["Ship by Nov 20", "Fix the blocker"]);
    expect(report.topics).toEqual([{ title: "Rollout", points: ["Phase 1", "Phase 2"] }]); // empty topic dropped
    expect(report.conclusions).toEqual(["Go ahead"]);
    expect(report.decisions).toEqual(["Use a feature flag"]);
    expect(report.generatedText).toBe("Generated on November 15, 2026");
    expect(hasReportContent(report)).toBe(true);
  });

  it("handles a legacy plain-text summary as the overview", () => {
    const report = buildMeetingReport(meeting(), "A plain legacy summary.", { now: NOW });
    expect(report.overview).toBe("A plain legacy summary.");
    expect(report.keyTakeaways).toEqual([]);
  });

  it("handles a JSON-stringified summary", () => {
    const report = buildMeetingReport(meeting(), JSON.stringify({ meeting_purpose: "From JSON" }), { now: NOW });
    expect(report.purpose).toBe("From JSON");
  });

  it("reports no content for empty / missing summaries and degrades gracefully", () => {
    for (const empty of [null, undefined, {}, ""]) {
      expect(hasReportContent(buildMeetingReport(meeting(), empty as never, { now: NOW }))).toBe(false);
    }
    const report = buildMeetingReport(
      meeting({ title: "", scheduledAt: "" as unknown as string, durationMinutes: null }),
      null,
      { now: NOW }
    );
    expect(report.title).toBe("Untitled meeting");
    expect(report.dateText).toBe("");
    expect(report.durationText).toBe("");
  });

  it("marks unfinished meetings as not complete", () => {
    const report = buildMeetingReport(meeting({ status: "PROCESSING" }), summary, { now: NOW });
    expect(report.isComplete).toBe(false);
    expect(report.statusLabel).toBe("AI Processing");
  });
});

describe("shared formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(135)).toBe("2 hr 15 min");
  });

  it("maps statuses to labels", () => {
    expect(getMeetingStatusLabel("RECORDING")).toBe("Recording Live");
    expect(getMeetingStatusLabel("EXTRACTED")).toBe("Done");
    expect(getMeetingStatusLabel("whatever")).toBe("Scheduled");
  });
});

describe("splitKeyPhrases", () => {
  it("always reproduces the original text", () => {
    const text = "Ship by Friday, a blocker for Q4 on Nov 20 (P0).";
    expect(splitKeyPhrases(text).map((s) => s.text).join("")).toBe(text);
    expect(splitKeyPhrases(text).filter((s) => s.strong).map((s) => s.text)).toEqual([
      "by Friday",
      "blocker",
      "Q4",
      "Nov 20",
      "P0",
    ]);
  });
});
