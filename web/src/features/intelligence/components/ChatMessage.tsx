"use client";

import { AlertCircle, Square } from "lucide-react";
import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessageRecord } from "@/lib/contracts/chat";
import { chatCopy } from "../copy/chatCopy";
import type { TurnError, TurnOutcome, TurnState } from "../state/chatTurnMachine";
import { buildCitations } from "../utils/citationModel";
import { describeError } from "../utils/errorText";
import { AnswerText } from "./AnswerText";
import { MessageActions } from "./MessageActions";
import { SourcesPanel } from "./SourcesPanel";

export function UserMessage({ text, notSent, onRetry }: { text: string; notSent?: boolean; onRetry?: () => void }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl bg-surface px-4 py-2.5 text-[15px] leading-relaxed [overflow-wrap:anywhere]" dir="auto">
        <p className="whitespace-pre-wrap">{text}</p>
        {notSent && (
          <p className="mt-1 text-xs text-[hsl(var(--danger))]" role="status">
            {chatCopy.notSent}{" "}
            {onRetry && <button type="button" className="font-medium underline underline-offset-2" onClick={onRetry}>{chatCopy.retry}</button>}
          </p>
        )}
      </div>
    </div>
  );
}

/** Stage line shown before the first token: pipeline facts only — never reasoning, prompts, scores or ids (ADR-11). */
export function StatusLine({ turn }: { turn: TurnState }) {
  const detail = turn.stageDetail as { question?: unknown; date_range?: { label?: unknown } } | null;
  const question = typeof detail?.question === "string" ? detail.question : null;
  const range = typeof detail?.date_range?.label === "string" ? detail.date_range.label : null;
  let label: string = chatCopy.status.thinking;
  if (turn.stage === "rewriting") label = chatCopy.status.rewriting;
  else if (turn.stage === "searching") label = chatCopy.status.searching;
  else if (turn.stage === "reading") label = chatCopy.status.reading(turn.sources.length);
  return (
    <div className="space-y-2" aria-hidden="true">
      <p className="text-sm text-muted-foreground">
        {label}
        {(question || range) && (
          <span className="ms-2 text-xs" dir="auto">{[range, question].filter(Boolean).join(" · ").slice(0, 160)}</span>
        )}
      </p>
      {/* Reserved space: the skeleton keeps the layout from jumping when text starts. Static under reduced motion. */}
      <div className="space-y-2 motion-safe:animate-pulse">
        <div className="h-3.5 w-11/12 rounded bg-surface" />
        <div className="h-3.5 w-9/12 rounded bg-surface" />
      </div>
    </div>
  );
}

interface AssistantProps {
  text: string;
  sources: ChatMessageRecord["sources"];
  outcome: TurnOutcome;
  pending?: boolean;
  /** Present for the live turn only. */
  turn?: TurnState;
  error?: TurnError | null;
  grounded?: boolean;
  messageId: string | null;
  feedback?: string | null;
  tz?: string | null;
  hasFilters?: boolean;
  onRetry?: () => void;
  onClearFiltersAndRetry?: () => void;
  onAskForRest?: () => void;
  onSuggest?: (q: string) => void;
}

function AssistantMessageImpl(p: AssistantProps) {
  const citations = useMemo(() => buildCitations(p.sources, p.tz), [p.sources, p.tz]);
  const showText = p.text.length > 0;
  const finished = !p.pending;
  const showActions = finished && showText && (p.outcome === "answer" || p.outcome === "truncated") && !p.error;

  return (
    <article className="max-w-[70ch]" aria-label="Assistant answer" data-outcome={p.outcome}>
      {p.pending && !showText && p.turn && <StatusLine turn={p.turn} />}

      {showText && p.outcome !== "no_results" && (
        <AnswerText text={p.text} citations={citations} streaming={!!p.pending} />
      )}

      {p.outcome === "no_results" && (
        <div className="space-y-2">
          <p className="text-[15px] leading-relaxed text-foreground/90">{chatCopy.noResults}</p>
          {p.hasFilters && p.onClearFiltersAndRetry && (
            <button type="button" onClick={p.onClearFiltersAndRetry} className="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              Clear filters and retry
            </button>
          )}
        </div>
      )}

      {p.outcome === "stopped" && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <Square className="size-3" aria-hidden />{chatCopy.stopped}
          {p.onRetry && <button type="button" className="ms-1 font-medium text-foreground underline underline-offset-2" onClick={p.onRetry}>{chatCopy.retry}</button>}
        </p>
      )}

      {p.outcome === "truncated" && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {chatCopy.truncated}{" "}
          {p.onAskForRest && <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={p.onAskForRest}>{chatCopy.askForRest}</button>}
        </p>
      )}

      {p.outcome === "filtered" && <p className="text-[15px] text-foreground/90">{chatCopy.filtered}</p>}

      {p.error && p.outcome !== "filtered" && (
        <div role="alert" className={cn("mt-2 flex items-start gap-2 rounded-lg border border-border bg-surface/50 p-3 text-sm", showText && "mt-3")}>
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-[hsl(var(--danger))]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p>{describeError(p.error)}{showText && " The answer above is incomplete."}</p>
            {p.error.requestId && <p className="mt-0.5 text-xs text-muted-foreground">Reference: {p.error.requestId}</p>}
            {p.onRetry && <button type="button" className="mt-1 min-h-8 font-medium underline underline-offset-2" onClick={p.onRetry}>{chatCopy.retry}</button>}
          </div>
        </div>
      )}

      {finished && showText && p.grounded === false && p.outcome === "answer" && p.text.length > 120 && (
        <p className="mt-2 text-xs text-muted-foreground">{chatCopy.unsupported}</p>
      )}

      {finished && <SourcesPanel citations={citations} />}
      {showActions && <MessageActions text={p.text} citations={citations} messageId={p.messageId} initialFeedback={p.feedback} />}
    </article>
  );
}
export const AssistantMessage = memo(AssistantMessageImpl);

/** Map a persisted assistant message to the same outcome vocabulary the live turn uses. */
export function outcomeOfRecord(m: ChatMessageRecord): { outcome: TurnOutcome; incomplete: boolean } {
  const fr = m.finish_reason ?? "";
  if (m.status === "cancelled" || fr === "cancelled") return { outcome: "stopped", incomplete: true };
  if (m.status === "failed" || fr === "error") return { outcome: m.content ? "error" : "error", incomplete: true };
  if (fr === "no_results") return { outcome: "no_results", incomplete: false };
  if (fr === "length") return { outcome: "truncated", incomplete: false };
  if (fr === "filtered") return { outcome: "filtered", incomplete: false };
  return { outcome: "answer", incomplete: false };
}
