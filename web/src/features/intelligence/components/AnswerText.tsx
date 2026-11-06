"use client";

import { Fragment, memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { parseMarkdown, trimIncompleteTail, type Block, type Inline } from "../utils/renderAnswer";
import type { CitationView } from "../utils/citationModel";
import { CitationChip } from "./CitationChip";

interface Ctx {
  citations: Map<string, CitationView>;
}

function InlineView({ nodes, ctx }: { nodes: Inline[]; ctx: Ctx }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text": return <Fragment key={i}>{n.text}</Fragment>;
          case "br": return <br key={i} />;
          case "code": return <code key={i} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.9em]">{n.text}</code>;
          case "strong": return <strong key={i} className="font-semibold"><InlineView nodes={n.children} ctx={ctx} /></strong>;
          case "em": return <em key={i}><InlineView nodes={n.children} ctx={ctx} /></em>;
          case "cite":
            return (
              <span key={i} className="whitespace-nowrap">
                {n.ids.map((id) => {
                  const view = ctx.citations.get(id);
                  return view ? <CitationChip key={id} view={view} position={view.number} /> : null;
                })}
              </span>
            );
        }
      })}
    </>
  );
}

const BlockView = memo(
  function BlockView({ block, ctx }: { block: Block; ctx: Ctx }) {
    switch (block.t) {
      case "p": return <p><InlineView nodes={block.children} ctx={ctx} /></p>;
      case "code": return <pre className="overflow-x-auto rounded-md bg-surface p-3 text-[13px]" dir="ltr"><code>{block.text}</code></pre>;
      case "ul": return <ul className="list-disc space-y-1 ps-5">{block.items.map((it, i) => <li key={i}><InlineView nodes={it} ctx={ctx} /></li>)}</ul>;
      case "ol": return <ol start={block.start} className="list-decimal space-y-1 ps-5">{block.items.map((it, i) => <li key={i}><InlineView nodes={it} ctx={ctx} /></li>)}</ol>;
    }
  },
  // Completed blocks never change while streaming: skip them unless their source or the citation set changed.
  (a, b) => a.block.src === b.block.src && a.ctx.citations === b.ctx.citations,
);

/**
 * Renders model output. `dir="auto"` per block so Urdu/Arabic paragraphs flow right-to-left independently of the UI.
 * While streaming, an unfinished `[S…` tail is hidden so chips never flicker as raw text.
 */
export function AnswerText({ text, citations, streaming = false, className }: {
  text: string; citations: CitationView[]; streaming?: boolean; className?: string;
}) {
  const map = useMemo(() => new Map(citations.map((c) => [c.id, c])), [citations]);
  const ctx = useMemo<Ctx>(() => ({ citations: map }), [map]);
  const blocks = useMemo(() => parseMarkdown(streaming ? trimIncompleteTail(text) : text, new Set(map.keys())), [text, map, streaming]);
  return (
    <div className={cn("space-y-3 text-[15px] leading-[1.7] text-foreground [overflow-wrap:anywhere]", className)} dir="auto">
      {blocks.map((b, i) => (
        <div key={i} dir="auto"><BlockView block={b} ctx={ctx} /></div>
      ))}
    </div>
  );
}
