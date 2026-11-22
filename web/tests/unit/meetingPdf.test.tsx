import path from "node:path";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { MeetingReportDocument } from "@/features/meetings/export/MeetingReportDocument";
import { registerPdfFonts } from "@/features/meetings/export/pdfFonts";
import { prepareMeetingReport } from "@/features/meetings/export/meetingReport";
import type { MeetingDetail } from "@/features/meetings/types";

/**
 * Renders the REAL document (real fonts, real layout engine) in Node and checks the output is a
 * valid, multi-page PDF. Visual quality is reviewed by eye; this guards structure and regressions.
 */

registerPdfFonts(path.resolve(__dirname, "../../public/fonts/inter"));

const sentence = "The group walked through trade-offs, rollout sequencing, ownership and risk before agreeing on next steps. ";

function meeting(summary: object, title = "Q4 Product Roadmap Review"): MeetingDetail {
  return {
    id: "m1",
    title,
    platform: "ZOOM",
    status: "DONE",
    scheduledAt: "2026-08-31T10:00:00.000Z",
    startedAt: null,
    endedAt: null,
    durationMinutes: 90,
    participantCount: 0,
    commitmentCount: 0,
    actionItemCount: 0,
    decisionCount: 0,
    summary: summary as never,
    createdAt: "2026-08-30T10:00:00.000Z",
    participants: [],
  };
}

async function render(m: MeetingDetail) {
  const { report } = prepareMeetingReport(m, m.summary, { now: new Date("2026-11-15T09:00:00Z") });
  const buffer = await renderToBuffer(React.createElement(MeetingReportDocument as never, { report }) as never);
  return buffer;
}

/** Count /Type /Page objects (not /Pages). */
function pageCount(buffer: Buffer): number {
  return (buffer.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

describe("meeting report PDF", () => {
  it("renders a valid single-page PDF for a short summary", async () => {
    const buffer = await render(
      meeting({ meeting_purpose: "Align on Q4.", overview: "Short overview.", key_takeaways: ["Ship by Nov 20"] })
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(5_000);
    expect(pageCount(buffer)).toBe(1);
  }, 30_000);

  it("flows long content across multiple A4 pages", async () => {
    const topics = Array.from({ length: 8 }, (_, i) => ({
      topic: `Topic ${i + 1}`,
      bullets: Array.from({ length: 6 }, (_, j) => `${sentence.repeat(j % 3 === 0 ? 3 : 1)} (point ${j + 1})`),
    }));
    const buffer = await render(
      meeting({
        meeting_purpose: sentence,
        overview: sentence.repeat(12),
        key_takeaways: Array.from({ length: 10 }, (_, i) => `${sentence} Takeaway ${i + 1} by Friday.`),
        topics_discussed: topics,
        conclusions: [sentence, sentence],
        decisions: [sentence],
      })
    );
    expect(pageCount(buffer)).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it("survives a very long title, unbroken tokens and special characters", async () => {
    const buffer = await render(
      meeting(
        {
          overview: `A${"x".repeat(200)} café “quoted” — 50% • déjà vu… ${sentence}`,
          key_takeaways: ["- URL: https://example.com/" + "segment/".repeat(30), "Emoji 🚀 are dropped cleanly."],
        },
        "An extraordinarily long meeting title that keeps on going and going to prove that wrapping works across several lines without clipping"
      )
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(buffer)).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("embeds the Inter font (not a fallback)", async () => {
    const buffer = await render(meeting({ overview: "Hello." }));
    expect(buffer.toString("latin1")).toMatch(/[A-Z]{6}\+Inter/);
  }, 30_000);
});
