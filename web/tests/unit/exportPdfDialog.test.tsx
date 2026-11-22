// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const generateMeetingPdf = vi.fn();
const preloadMeetingPdf = vi.fn(() => Promise.resolve());
vi.mock("@/features/meetings/export/generateMeetingPdf", () => ({
  generateMeetingPdf: (...args: unknown[]) => generateMeetingPdf(...args),
  preloadMeetingPdf: () => preloadMeetingPdf(),
}));
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() } }));

import { ExportPdfDialog } from "@/features/meetings/components/MeetingDetail/ExportPdfDialog";
import { ExportPdfButton } from "@/features/meetings/components/MeetingDetail/ExportPdfButton";
import type { MeetingDetail } from "@/features/meetings/types";

const meeting: MeetingDetail = {
  id: "m1",
  title: "Q4 Roadmap Review",
  platform: "ZOOM",
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
};

const englishSummary = {
  meeting_purpose: "Align on Q4.",
  overview: "We reviewed the roadmap.",
  key_takeaways: ["Ship by Nov 20"],
  topics_discussed: [{ topic: "Rollout", bullets: ["Phase 1"] }],
  conclusions: ["Go ahead"],
  decisions: ["Use a flag"],
};

const pdfBlob = () => new Blob(["%PDF-1.7 fake"], { type: "application/pdf" });

function renderDialog(props: Partial<React.ComponentProps<typeof ExportPdfDialog>> = {}) {
  return render(
    <ExportPdfDialog
      open
      onOpenChange={vi.fn()}
      meeting={meeting}
      summary={englishSummary}
      language="en"
      canSwitchToEnglish={false}
      {...props}
    />
  );
}

let anchorClicks: Array<{ href: string; download: string }> = [];
const realClick = HTMLAnchorElement.prototype.click;

beforeEach(() => {
  generateMeetingPdf.mockReset();
  preloadMeetingPdf.mockClear();
  toastSuccess.mockReset();
  anchorClicks = [];
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    anchorClicks.push({ href: this.href, download: this.download });
  };
});
afterEach(() => {
  HTMLAnchorElement.prototype.click = realClick;
});

describe("ExportPdfDialog", () => {
  it("generates on open, shows progress, then enables the download", async () => {
    let finish!: (b: Blob) => void;
    generateMeetingPdf.mockReturnValue(new Promise<Blob>((res) => (finish = res)));
    renderDialog();

    expect(await screen.findByText("Generating your report…")).toBeTruthy();
    const download = screen.getByRole("button", { name: /generating/i }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    expect(download.getAttribute("aria-busy")).toBe("true");

    await act(async () => finish(pdfBlob()));
    expect(await screen.findByText("Ready to download")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Q4-Roadmap-Review-2026-08-3[01]\.pdf/)).toBeTruthy();
  });

  it("downloads the generated file with the meaningful filename and confirms with a toast", async () => {
    generateMeetingPdf.mockResolvedValue(pdfBlob());
    renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));
    expect(anchorClicks).toHaveLength(1);
    expect(anchorClicks[0].download).toMatch(/^Q4-Roadmap-Review-2026-08-3[01]\.pdf$/);
    expect(anchorClicks[0].href).toMatch(/^blob:/);
    expect(toastSuccess).toHaveBeenCalledWith("PDF downloaded");
  });

  it("passes the displayed summary through to the generator", async () => {
    generateMeetingPdf.mockResolvedValue(pdfBlob());
    renderDialog();
    await screen.findByText("Ready to download");
    const report = generateMeetingPdf.mock.calls[0][0];
    expect(report.purpose).toBe("Align on Q4.");
    expect(report.keyTakeaways).toEqual(["Ship by Nov 20"]);
    expect(report.topics[0]).toEqual({ title: "Rollout", points: ["Phase 1"] });
    expect(report.conclusions).toEqual(["Go ahead"]);
    expect(report.decisions).toEqual(["Use a flag"]);
  });

  it("shows a clear error with a retry that recovers", async () => {
    generateMeetingPdf.mockRejectedValueOnce(new Error("font fetch failed"));
    renderDialog();

    expect(await screen.findByText(/couldn't generate the PDF/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(true);

    generateMeetingPdf.mockResolvedValueOnce(pdfBlob());
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Ready to download")).toBeTruthy();
    expect(screen.queryByText(/couldn't generate the PDF/i)).toBeNull();
    expect((screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not generate non-Latin summaries, and points to the English view", async () => {
    renderDialog({
      language: "ur",
      canSwitchToEnglish: true,
      summary: { overview: "ٹیم نے منصوبے پر بات کی اور فیصلے کیے۔", key_takeaways: ["سب کچھ ٹھیک ہے"] },
    });
    expect(await screen.findByText(/Switch the summary to English/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(true);
    expect(generateMeetingPdf).not.toHaveBeenCalled();
  });

  it("explains when there is no summary yet", async () => {
    renderDialog({ summary: null });
    expect(await screen.findByText(/no summary to export yet/i)).toBeTruthy();
    expect(generateMeetingPdf).not.toHaveBeenCalled();
  });

  it("revokes the generated file when the dialog closes", async () => {
    generateMeetingPdf.mockResolvedValue(pdfBlob());
    const { rerender } = renderDialog();
    await screen.findByText("Ready to download");
    rerender(
      <ExportPdfDialog open={false} onOpenChange={vi.fn()} meeting={meeting} summary={englishSummary} language="en" canSwitchToEnglish={false} />
    );
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
  });
});

describe("ExportPdfButton", () => {
  it("is disabled until a summary exists", () => {
    const { rerender } = render(
      <ExportPdfButton meeting={meeting} summary={null} language="en" canSwitchToEnglish={false} />
    );
    expect((screen.getByRole("button", { name: /export pdf/i }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<ExportPdfButton meeting={meeting} summary={englishSummary} language="en" canSwitchToEnglish={false} />);
    expect((screen.getByRole("button", { name: /export pdf/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("warms the PDF engine on intent (hover / focus), never on mount, and only when there is a summary", () => {
    const { rerender } = render(<ExportPdfButton meeting={meeting} summary={englishSummary} language="en" canSwitchToEnglish={false} />);
    expect(preloadMeetingPdf).not.toHaveBeenCalled();

    const button = screen.getByRole("button", { name: /export pdf/i });
    fireEvent.pointerEnter(button);
    expect(preloadMeetingPdf).toHaveBeenCalledTimes(1);
    fireEvent.focus(button);
    expect(preloadMeetingPdf).toHaveBeenCalledTimes(2);

    preloadMeetingPdf.mockClear();
    rerender(<ExportPdfButton meeting={meeting} summary={null} language="en" canSwitchToEnglish={false} />);
    fireEvent.pointerEnter(screen.getByRole("button", { name: /export pdf/i }));
    expect(preloadMeetingPdf).not.toHaveBeenCalled();
  });

  it("opens the dialog on click and does not load anything before that", async () => {
    generateMeetingPdf.mockResolvedValue(pdfBlob());
    render(<ExportPdfButton meeting={meeting} summary={englishSummary} language="en" canSwitchToEnglish={false} />);
    expect(generateMeetingPdf).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));
    expect(await screen.findByText("Export as PDF")).toBeTruthy();
    await waitFor(() => expect(generateMeetingPdf).toHaveBeenCalledTimes(1));
  });
});
