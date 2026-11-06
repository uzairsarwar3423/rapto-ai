import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, toPlainText, trimIncompleteTail, type Block, type Inline } from "@/features/intelligence/utils/renderAnswer";
import { buildCitations, groupCitations, sourceHref } from "@/features/intelligence/utils/citationModel";
import { formatTimestamp } from "@/features/intelligence/utils/formatTime";
import { checkMessage, countChars } from "@/features/intelligence/utils/inputLimits";
import type { SourceItem } from "@/lib/contracts/chat";
import corpus from "../../../services/ai-pipeline/tests/fixtures/chat_injection_corpus.json";

const ids = new Set(["S1", "S2", "S3"]);
const src = (over: Partial<SourceItem>): SourceItem => ({ source_id: "S1", type: "transcript_chunk", preview: "", redacted: false, ...over });

/** Every node type the renderer may ever produce: anything else is a safety regression. */
const ALLOWED_INLINE = new Set(["text", "strong", "em", "code", "br", "cite"]);
function walkInline(nodes: Inline[], seen: Set<string>) {
  for (const n of nodes) {
    seen.add(n.t);
    if (n.t === "strong" || n.t === "em") walkInline(n.children, seen);
  }
}
function nodeTypes(blocks: Block[]): Set<string> {
  const seen = new Set<string>();
  for (const b of blocks) {
    seen.add(b.t);
    if (b.t === "p") walkInline(b.children, seen);
    if (b.t === "ul" || b.t === "ol") b.items.forEach((i) => walkInline(i, seen));
  }
  return seen;
}

describe("renderAnswer", () => {
  it("turns valid markers into a chip group and strips unknown ids", () => {
    const [p] = parseMarkdown("Billing ships Friday [S1]. Also [S9] and [S1, S9, S3].", ids);
    const cites = (p as Extract<Block, { t: "p" }>).children.filter((n) => n.t === "cite");
    expect(cites).toEqual([{ t: "cite", ids: ["S1"] }, { t: "cite", ids: ["S1", "S3"] }]);
    expect(toPlainText([p])).not.toContain("S9");
  });

  it("collapses adjacent markers into one group", () => {
    expect(parseInline("x [S1][S2] [S3]", ids)).toContainEqual({ t: "cite", ids: ["S1", "S2", "S3"] });
  });

  it("keeps markers literal inside code spans and fences", () => {
    expect(parseInline("see `[S1]` here", ids)).toContainEqual({ t: "code", text: "[S1]" });
    const [b] = parseMarkdown("```\n[S1] <b>x</b>\n```", ids);
    expect(b).toMatchObject({ t: "code", text: "[S1] <b>x</b>" });
  });

  it("unwraps links (discarding the URL) and drops images", () => {
    expect(toPlainText(parseMarkdown("go [here](https://evil.example/x) now ![p](https://evil.example/p.png)", ids))).toBe("go here now ");
    expect(toPlainText(parseMarkdown("[javascript](javascript:alert(1))", ids))).toBe("javascript");
  });

  it("renders lists, emphasis and headings only as allowed nodes", () => {
    const blocks = parseMarkdown("# Title\n\n- **a** [S1]\n- *b*\n\n1. one\n2. two", ids);
    expect(blocks.map((b) => b.t)).toEqual(["p", "ul", "ol"]);
    expect([...nodeTypes(blocks)].every((t) => ["p", "ul", "ol", "code", ...ALLOWED_INLINE].includes(t))).toBe(true);
  });

  it("does not italicise snake_case or underscores inside words", () => {
    expect(toPlainText(parseMarkdown("use snake_case_name and 3_000", ids))).toBe("use snake_case_name and 3_000");
  });

  it("hides an unfinished marker at the tail while streaming", () => {
    expect(trimIncompleteTail("Ships Friday [S")).toBe("Ships Friday ");
    expect(trimIncompleteTail("Ships Friday [S1, S")).toBe("Ships Friday ");
    expect(trimIncompleteTail("Ships Friday [S1]")).toBe("Ships Friday [S1]");
  });

  it("keeps raw HTML as inert text and never produces an element outside the allowlist (backend injection corpus)", () => {
    const hostile = [
      ...corpus.transcripts, ...corpus.titles, ...corpus.speakers, ...corpus.history.map((h) => h.content), ...corpus.summaries,
      "<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<a href=\"javascript:alert(1)\">x</a>", "&lt;script&gt;",
      "[x](data:text/html;base64,PHNjcmlwdD4=)", "‮evil", "**<svg onload=alert(1)>**", "\\[S1\\]",
    ];
    for (const text of hostile) {
      const blocks = parseMarkdown(text, ids);
      for (const t of nodeTypes(blocks)) expect(["p", "ul", "ol", "code", ...ALLOWED_INLINE], text).toContain(t);
      expect(JSON.stringify(blocks)).not.toMatch(/"(href|html|dangerously)/i);
    }
  });
});

describe("citationModel", () => {
  it("links transcript sources to the exact second and builds accessible names", () => {
    const [v] = buildCitations([src({ meeting_id: "m1", meeting_title: "Weekly Standup", start_ms: 723_000, speaker: "Ahmed" })]);
    expect(v.href).toBe("/meetings/m1/transcript?t=723");
    expect(v.timeLabel).toBe("12:03");
    expect(v.accessibleName).toBe("Source 1: Weekly Standup, 12:03, Ahmed");
  });

  it("never links redacted sources or ids that fail validation", () => {
    expect(buildCitations([src({ meeting_id: "m1", redacted: true })])[0]).toMatchObject({ href: null, unavailable: true });
    expect(sourceHref(src({ meeting_id: "../admin", start_ms: 1 }))).toBeNull();
    expect(sourceHref(src({ meeting_id: "a b" }))).toBeNull();
  });

  it("routes commitments and analytics to real pages only", () => {
    expect(sourceHref(src({ type: "commitment", commitment_id: "c1", meeting_id: "m1" }))).toBe("/commitments/c1");
    expect(sourceHref(src({ type: "analytics", tool: "list_overdue_commitments", params: { owner_ids: ["u1", "../x"] } }))).toBe("/commitments?status=PENDING&ownerIds=u1");
    expect(sourceHref(src({ type: "analytics", tool: "unknown_tool" }))).toBeNull();
  });

  it("groups by meeting in order of first citation, analytics separately", () => {
    const g = groupCitations(buildCitations([
      src({ source_id: "S1", meeting_id: "m1", meeting_title: "A" }), src({ source_id: "S2", type: "analytics", tool: "meeting_count" }),
      src({ source_id: "S3", meeting_id: "m2", meeting_title: "B" }), src({ source_id: "S4", meeting_id: "m1", meeting_title: "A" }),
    ]));
    expect(g.map((x) => [x.key, x.items.length])).toEqual([["m:m1", 2], ["analytics", 1], ["m:m2", 1]]);
  });
});

describe("formatTime / inputLimits", () => {
  it("formats m:ss and h:mm:ss at the boundaries", () => {
    expect(["0", "59999", "60000", "3599999", "3600000", "7384000"].map((x) => formatTimestamp(Number(x)))).toEqual(["0:00", "0:59", "1:00", "59:59", "1:00:00", "2:03:04"]);
    expect(formatTimestamp(-1)).toBeNull();
  });

  it("counts code points like the server (emoji = 1) and flags empty / over-limit", () => {
    expect(countChars("😀")).toBe(1);
    expect(checkMessage("😀".repeat(2000)).ok).toBe(true);
    expect(checkMessage("x".repeat(2001))).toMatchObject({ ok: false, problem: "char_limit" });
    expect(checkMessage("​  \n")).toMatchObject({ ok: false, problem: "empty" });
    expect(checkMessage("x".repeat(1600)).showCounter).toBe(true);
    expect(checkMessage("hi").showCounter).toBe(false);
  });
});
