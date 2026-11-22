// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { emphasize, stripLeadingBulletChar } from "@/features/meetings/components/MeetingDetail/summaryText";

const emphasised = (text: string) => {
  const { container } = render(<p>{emphasize(text)}</p>);
  return [...container.querySelectorAll("span")].map((s) => s.textContent);
};

describe("emphasize", () => {
  it("highlights deadlines and dates", () => {
    expect(emphasised("Ship it by Friday and finish docs by end of week.")).toEqual(["by Friday", "by end of week"]);
    expect(emphasised("Launch on Nov 20, then review on 12/05.")).toEqual(["Nov 20", "12/05"]);
    expect(emphasised("Targets for Q4 are fixed.")).toEqual(["Q4"]);
  });

  it("highlights priorities", () => {
    expect(emphasised("This is a high-priority blocker, and urgent.")).toEqual(["high-priority", "blocker", "urgent"]);
    expect(emphasised("The P0 deadline moved.")).toEqual(["P0", "deadline"]);
  });

  it("leaves ordinary text and other languages untouched", () => {
    expect(emphasised("The team discussed the roadmap.")).toEqual([]);
    expect(emphasize("The team discussed the roadmap.")).toBe("The team discussed the roadmap.");
    expect(emphasised("ٹیم نے منصوبے پر بات کی")).toEqual([]);
  });

  it("keeps the original text intact", () => {
    const { container } = render(<p>{emphasize("Ship by Friday, a blocker for Q4.")}</p>);
    expect(container.textContent).toBe("Ship by Friday, a blocker for Q4.");
  });
});

describe("stripLeadingBulletChar", () => {
  it("removes model-added bullet characters", () => {
    expect(stripLeadingBulletChar("- item")).toBe("item");
    expect(stripLeadingBulletChar("• item")).toBe("item");
    expect(stripLeadingBulletChar("* item ")).toBe("item");
    expect(stripLeadingBulletChar("plain")).toBe("plain");
  });
});
