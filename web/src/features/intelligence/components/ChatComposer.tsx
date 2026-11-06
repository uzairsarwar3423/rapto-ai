"use client";

import { ArrowUp, Square } from "lucide-react";
import { useCallback, useEffect, useId, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { chatCopy } from "../copy/chatCopy";
import { checkMessage } from "../utils/inputLimits";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** An answer is being produced in this conversation: Send becomes Stop (the input stays editable). */
  streaming: boolean;
  /** Why sending is blocked right now (quota, cool-down, offline, busy). Exposed as text, not only by colour. */
  blockedReason?: string | null;
  /** Inline validation from the server (e.g. token-limit 422). */
  serverProblem?: string | null;
  autoFocusKey?: string | null;
}

const MAX_HEIGHT_PX = 8 * 24 + 16; // 8 lines

const isCoarsePointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export function ChatComposer({ value, onChange, onSend, onStop, streaming, blockedReason, serverProblem, autoFocusKey }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const check = checkMessage(value);
  const canSend = check.ok && !blockedReason && !streaming;

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, []);
  useEffect(resize, [value, resize]);
  useEffect(() => {
    // New conversation / switched conversation: focus the input (desktop only — never pop the mobile keyboard).
    if (!isCoarsePointer()) ref.current?.focus();
  }, [autoFocusKey]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME composition: Enter confirms the candidate, it must NOT send half-typed text.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey && !isCoarsePointer()) {
      e.preventDefault();
      if (canSend) onSend();
      return;
    }
    if (e.key === "Escape" && streaming) {
      e.preventDefault();
      onStop();
    }
  };

  const reason = serverProblem ?? blockedReason ?? (check.problem === "char_limit" ? `Messages can be up to ${check.limit.toLocaleString()} characters.` : null);

  return (
    <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className={cn("flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-brand/40", reason ? "border-[hsl(var(--danger))]/50" : "border-border")}>
          <textarea
            ref={ref}
            value={value}
            rows={1}
            dir="auto"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={chatCopy.placeholder}
            aria-label="Ask a question about your meetings"
            aria-describedby={hintId}
            aria-invalid={!!reason}
            enterKeyHint="send"
            className="max-h-48 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
          />
          {/* Send and Stop occupy the same box so the pointer target never moves. */}
          {streaming ? (
            <button type="button" onClick={onStop} aria-label={chatCopy.stop} className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <Square className="size-4 fill-current" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={onSend} disabled={!canSend} aria-label={chatCopy.send} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-40">
              <ArrowUp className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <div id={hintId} className="mt-1 flex min-h-5 items-center justify-between gap-3 px-2 text-xs text-muted-foreground" aria-live="off">
          <span className={cn(reason && "text-[hsl(var(--danger))]")} role={reason ? "alert" : undefined}>
            {reason ?? (value.length === 0 && !isCoarsePointer() ? "Enter to send · Shift+Enter for a new line" : "")}
          </span>
          {check.showCounter && (
            <span className={cn("tabular-nums", !check.ok && check.problem === "char_limit" && "font-medium text-[hsl(var(--danger))]")} aria-label={`${check.count} of ${check.limit} characters`}>
              {check.count.toLocaleString()}/{check.limit.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
