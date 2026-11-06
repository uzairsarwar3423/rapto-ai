/**
 * renderAnswer.ts
 * ───────────────
 * Parses model output into a small, closed AST. Safe by construction (ADR-6):
 *
 *  - The AST has NO node that can carry markup, a URL or an image: paragraph, list, strong, emphasis, inline/block code,
 *    line break, citation. There is no raw-HTML path, and the renderer never uses dangerouslySetInnerHTML, so literal
 *    `<script>` or `<img onerror=…>` in model text becomes harmless visible characters.
 *  - Links `[text](url)` are UNWRAPPED to their text (the URL is discarded); images `![alt](url)` are dropped.
 *    The server strips these too (Day 58 scrubber) — this is the independent second line of defence.
 *  - `[S#]` markers become citations ONLY for ids present in THIS message's sources; anything else (a hallucinated
 *    `[S9]`) is stripped, never rendered as a chip.
 *  - Markers inside code spans / fenced blocks stay literal.
 *  - Adjacent markers (`[S1][S3]`, `[S1, S3]`) collapse into one group.
 *
 * Pure functions, no React: exhaustively unit-tested against the XSS corpus.
 */

export type Inline =
  | { t: "text"; text: string }
  | { t: "strong"; children: Inline[] }
  | { t: "em"; children: Inline[] }
  | { t: "code"; text: string }
  | { t: "br" }
  | { t: "cite"; ids: string[] };

export type Block =
  | { t: "p"; src: string; children: Inline[] }
  | { t: "ul"; src: string; items: Inline[][] }
  | { t: "ol"; src: string; start: number; items: Inline[][] }
  | { t: "code"; src: string; text: string };

const CITE = /^\[(S[1-9]\d{0,2}(?:\s*,\s*S[1-9]\d{0,2})*)\]/;
// The URL part allows one level of nested parentheses so `(javascript:alert(1))` is consumed whole.
const LINK = /^\[([^\]\n]*)\]\(((?:[^()\n]|\([^()\n]*\))*)\)/;
const IMAGE = /^!\[([^\]\n]*)\]\(((?:[^()\n]|\([^()\n]*\))*)\)/;
const ESCAPABLE = "\\`*_{}[]()#+-.!|>~";

/** Remove an unfinished trailing marker/emphasis fragment while streaming, so users never see `[S` flicker. */
export function trimIncompleteTail(text: string): string {
  return text.replace(/\[S?\d*(?:\s*,\s*S?\d*)*$/, "");
}

function flushText(out: Inline[], buf: string): string {
  if (buf) out.push({ t: "text", text: buf });
  return "";
}

const isWordChar = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}]/u.test(c);

export function parseInline(src: string, validIds: ReadonlySet<string>): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    if (c === "\\" && i + 1 < n && ESCAPABLE.includes(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }

    if (c === "`") {
      let run = 1;
      while (src[i + run] === "`") run++;
      const fence = "`".repeat(run);
      const close = src.indexOf(fence, i + run);
      if (close !== -1 && close > i + run) {
        buf = flushText(out, buf);
        out.push({ t: "code", text: src.slice(i + run, close) });
        i = close + run;
        continue;
      }
    }

    if (c === "!" && src[i + 1] === "[") {
      const m = IMAGE.exec(src.slice(i));
      if (m) {
        i += m[0].length; // dropped entirely
        continue;
      }
    }

    if (c === "[") {
      const rest = src.slice(i);
      const cite = CITE.exec(rest);
      if (cite) {
        buf = flushText(out, buf);
        const ids = cite[1].split(",").map((s) => s.trim());
        out.push({ t: "cite", ids: ids.filter((id) => validIds.has(id)) });
        i += cite[0].length;
        continue;
      }
      const link = LINK.exec(rest);
      if (link) {
        buf = flushText(out, buf);
        out.push(...parseInline(link[1], validIds)); // unwrap: keep the text, discard the URL
        i += link[0].length;
        continue;
      }
    }

    if ((c === "*" || c === "_") && src[i + 1] === c) {
      const close = src.indexOf(c + c, i + 2);
      if (close > i + 2 && src[i + 2] !== " " && src[close - 1] !== " ") {
        buf = flushText(out, buf);
        out.push({ t: "strong", children: parseInline(src.slice(i + 2, close), validIds) });
        i = close + 2;
        continue;
      }
    }

    if (c === "*" || c === "_") {
      const prev = src[i - 1];
      // `_` inside a word (snake_case, 3_000) is not emphasis; `*` may be.
      const opens = c === "*" ? src[i + 1] !== " " && src[i + 1] !== undefined : !isWordChar(prev) && src[i + 1] !== " " && src[i + 1] !== undefined;
      if (opens) {
        let close = -1;
        for (let j = i + 1; j < n; j++) {
          if (src[j] === c && src[j - 1] !== " " && src[j - 1] !== "\\" && src[j + 1] !== c && (c === "*" || !isWordChar(src[j + 1]))) {
            close = j;
            break;
          }
        }
        if (close > i + 1) {
          buf = flushText(out, buf);
          out.push({ t: "em", children: parseInline(src.slice(i + 1, close), validIds) });
          i = close + 1;
          continue;
        }
      }
    }

    buf += c;
    i++;
  }
  flushText(out, buf);
  return collapseCitations(out);
}

/** Merge adjacent citation nodes (ignoring whitespace-only text between them) and drop groups with no valid id. */
function collapseCitations(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.t === "cite") {
      let target = out[out.length - 1];
      let swallowed: Inline | undefined;
      if (target && target.t === "text" && /^\s+$/.test(target.text) && out[out.length - 2]?.t === "cite") {
        swallowed = target;
        target = out[out.length - 2];
      }
      if (target && target.t === "cite") {
        if (swallowed) out.pop();
        for (const id of node.ids) if (!target.ids.includes(id)) target.ids.push(id);
        continue;
      }
      out.push({ t: "cite", ids: [...new Set(node.ids)] });
      continue;
    }
    out.push(node);
  }
  // A stripped (empty) group leaves no trace, and the space before it is tidied.
  const cleaned: Inline[] = [];
  for (const node of out) {
    if (node.t === "cite" && node.ids.length === 0) {
      const last = cleaned[cleaned.length - 1];
      if (last?.t === "text") last.text = last.text.replace(/[ \t]+$/, "");
      continue;
    }
    cleaned.push(node);
  }
  return cleaned;
}

// ─── Blocks ──────────────────────────────────────────────────────────────────────────────────────────────────────

const UL = /^\s{0,3}(?:[-*•+])\s+(.*)$/;
const OL = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const FENCE = /^\s{0,3}(```+|~~~+)/;

function paragraphInlines(lines: string[], validIds: ReadonlySet<string>): Inline[] {
  const out: Inline[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) out.push({ t: "br" });
    out.push(...parseInline(line.trim(), validIds));
  });
  return out;
}

export function parseMarkdown(text: string, validIds: ReadonlySet<string> = new Set()): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const body: string[] = [];
      const start = i;
      i++;
      while (i < lines.length && !new RegExp(`^\\s{0,3}${marker}{3,}\\s*$`).test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++; // closing fence (an unclosed fence while streaming is just the text so far)
      blocks.push({ t: "code", src: lines.slice(start, i).join("\n"), text: body.join("\n") });
      continue;
    }

    if (UL.test(line)) {
      const start = i;
      const items: Inline[][] = [];
      while (i < lines.length && UL.test(lines[i])) {
        const m = UL.exec(lines[i])!;
        items.push(parseInline(m[1].trim(), validIds));
        i++;
      }
      blocks.push({ t: "ul", src: lines.slice(start, i).join("\n"), items });
      continue;
    }

    const ol = OL.exec(line);
    if (ol) {
      const start = i;
      const first = Number(ol[1]);
      const items: Inline[][] = [];
      while (i < lines.length && OL.test(lines[i])) {
        items.push(parseInline(OL.exec(lines[i])![2].trim(), validIds));
        i++;
      }
      blocks.push({ t: "ol", src: lines.slice(start, i).join("\n"), start: first, items });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      // Headings are not in the allowed subset: render as a bold paragraph, never as a heading element.
      blocks.push({ t: "p", src: line, children: [{ t: "strong", children: parseInline(heading[1].trim(), validIds) }] });
      i++;
      continue;
    }

    const start = i;
    const para: string[] = [];
    while (
      i < lines.length && lines[i].trim() !== "" && !FENCE.test(lines[i]) && !UL.test(lines[i]) && !OL.test(lines[i]) && !HEADING.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ t: "p", src: lines.slice(start, i).join("\n"), children: paragraphInlines(para, validIds) });
  }
  return blocks;
}

/** Plain-text projection (for Copy, accessible summaries, export). Citations become their `[S#]` markers. */
export function toPlainText(blocks: Block[]): string {
  const inline = (nodes: Inline[]): string =>
    nodes.map((n) => {
      switch (n.t) {
        case "text": return n.text;
        case "code": return n.text;
        case "br": return "\n";
        case "strong":
        case "em": return inline(n.children);
        case "cite": return n.ids.map((id) => `[${id}]`).join("");
      }
    }).join("");
  return blocks
    .map((b) => {
      switch (b.t) {
        case "p": return inline(b.children);
        case "code": return b.text;
        case "ul": return b.items.map((it) => `• ${inline(it)}`).join("\n");
        case "ol": return b.items.map((it, idx) => `${b.start + idx}. ${inline(it)}`).join("\n");
      }
    })
    .join("\n\n");
}

/** Serialise back to Markdown with citations as numbered footnote references (`[^1]`), for Copy-as-Markdown / export. */
export function toMarkdown(blocks: Block[], footnoteNumber: (id: string) => number | null): string {
  const inline = (nodes: Inline[]): string =>
    nodes.map((n) => {
      switch (n.t) {
        case "text": return n.text.replace(/([\\`*_[\]])/g, "\\$1");
        case "code": return `\`${n.text}\``;
        case "br": return "  \n";
        case "strong": return `**${inline(n.children)}**`;
        case "em": return `*${inline(n.children)}*`;
        case "cite": return n.ids.map((id) => { const k = footnoteNumber(id); return k ? `[^${k}]` : ""; }).join("");
      }
    }).join("");
  return blocks
    .map((b) => {
      switch (b.t) {
        case "p": return inline(b.children);
        case "code": return "```\n" + b.text + "\n```";
        case "ul": return b.items.map((it) => `- ${inline(it)}`).join("\n");
        case "ol": return b.items.map((it, idx) => `${b.start + idx}. ${inline(it)}`).join("\n");
      }
    })
    .join("\n\n");
}
