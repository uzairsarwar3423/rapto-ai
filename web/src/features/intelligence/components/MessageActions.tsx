"use client";

import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { FeedbackReason } from "@/lib/contracts/chat";
import { useSubmitFeedback } from "../api/chatSessionsApi";
import { chatCopy } from "../copy/chatCopy";
import { chatTelemetry } from "../telemetry/chatTelemetry";
import type { CitationView } from "../utils/citationModel";
import { parseMarkdown, toMarkdown, toPlainText } from "../utils/renderAnswer";

const iconBtn =
  "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 [@media(pointer:coarse)]:size-11";

export function MessageActions({ text, citations, messageId, initialFeedback }: {
  text: string; citations: CitationView[]; messageId: string | null; initialFeedback?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<"up" | "down" | null>(initialFeedback === "up" || initialFeedback === "down" ? initialFeedback : null);
  const [askReason, setAskReason] = useState(false);
  const feedback = useSubmitFeedback();

  const blocks = parseMarkdown(text, new Set(citations.map((c) => c.id)));

  const copy = async (variant: "plain" | "markdown") => {
    let out: string;
    if (variant === "plain") {
      out = toPlainText(blocks);
    } else {
      const order: string[] = [];
      const md = toMarkdown(blocks, (id) => {
        if (!order.includes(id)) order.push(id);
        return order.indexOf(id) + 1;
      });
      const notes = order.map((id, i) => {
        const c = citations.find((x) => x.id === id);
        return c ? `[^${i + 1}]: ${c.label}${c.href ? ` (${c.href})` : ""}` : "";
      }).filter(Boolean);
      out = notes.length ? `${md}\n\n${notes.join("\n")}` : md;
    }
    try {
      await navigator.clipboard.writeText(out);
      setCopied(true);
      toast.success(chatCopy.copied);
      chatTelemetry.copyClicked({ variant });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  const send = (next: "up" | "down", reason?: FeedbackReason) => {
    if (!messageId || messageId.startsWith("local-")) return;
    const prev = rating;
    setRating(next);
    feedback.mutate(
      { messageId, rating: next, reason: reason ?? null },
      {
        onSuccess: () => {
          chatTelemetry.feedbackSubmitted({ rating: next, reason });
          toast.success(chatCopy.feedbackThanks);
        },
        onError: () => {
          setRating(prev);
          toast.error("Couldn't send feedback. Try again.");
        },
      },
    );
  };

  return (
    <div className="mt-2 min-h-8">
      <div role="toolbar" aria-label="Message actions" className="flex items-center gap-0.5">
        <button type="button" className={iconBtn} onClick={() => copy("plain")} aria-label="Copy answer" title="Copy">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </button>
        <button type="button" className={iconBtn} onClick={() => copy("markdown")} aria-label="Copy as Markdown with sources" title="Copy as Markdown">
          <span className="text-[10px] font-semibold" aria-hidden>MD</span>
        </button>
        <button type="button" className={cn(iconBtn, rating === "up" && "text-brand")} aria-pressed={rating === "up"} aria-label="Good answer" onClick={() => { setAskReason(false); send("up"); }} disabled={!messageId}>
          <ThumbsUp className="size-4" aria-hidden />
        </button>
        <button type="button" className={cn(iconBtn, rating === "down" && "text-[hsl(var(--danger))]")} aria-pressed={rating === "down"} aria-label="Bad answer" onClick={() => { send("down"); setAskReason(true); }} disabled={!messageId}>
          <ThumbsDown className="size-4" aria-hidden />
        </button>
      </div>
      {askReason && rating === "down" && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5" role="group" aria-label="What was wrong?">
          {(Object.keys(chatCopy.feedbackReasons) as FeedbackReason[]).map((r) => (
            <button key={r} type="button" className="min-h-8 rounded-full border border-border px-2.5 text-xs hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => { send("down", r); setAskReason(false); }}>
              {chatCopy.feedbackReasons[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
