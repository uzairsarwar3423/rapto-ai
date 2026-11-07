"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Menu, Sparkles } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuthStore } from "@/features/auth/store/auth.store";
import { ID_PATTERN } from "@/lib/contracts/chat";
import { ChatRequestError } from "../api/chatClient";
import { flattenMessages, useChatMessages, useChatScope, useChatSessions, useChatSuggestions } from "../api/chatSessionsApi";
import { chatCopy } from "../copy/chatCopy";
import { useChatDraft } from "../hooks/useChatDraft";
import { quotaLevel, useChatQuota } from "../state/chatQuotaStore";
import { canRetry, deriveOutcome, isActive, type TurnOutcome } from "../state/chatTurnMachine";
import { configureStreamManager, dismissChatStream, retryChatMessage, sendChatMessage, stopChatStream, useChatStreams } from "../state/streamManager";
import { chatTelemetry } from "../telemetry/chatTelemetry";
import { AssistantMessage, outcomeOfRecord, UserMessage } from "./ChatMessage";
import { ChatComposer } from "./ChatComposer";
import { ChatErrorBoundary } from "./ChatErrorBoundary";
import { QuotaBanner } from "./QuotaBanner";
import { SessionSidebar } from "./SessionSidebar";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

const NEAR_BOTTOM_PX = 80;

function ChatPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const scope = useChatScope();
  const tz = useAuthStore((s) => s.user?.timezone);

  useEffect(() => {
    configureStreamManager({ queryClient: qc });
    chatTelemetry.opened();
  }, [qc]);

  const rawSession = params.get("session");
  const sessionId = rawSession && ID_PATTERN.test(rawSession) ? rawSession : null;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [localProblem, setLocalProblem] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [draft, setDraft] = useChatDraft(scope, sessionId);
  const filters = useMemo(() => ({ meeting_ids: [], speaker_ids: [] }), []);

  // ── server data ──
  const sessionsQ = useChatSessions();
  const sessions = useMemo(() => sessionsQ.data?.pages.flatMap((p) => p.items) ?? [], [sessionsQ.data]);
  const suggestionsQ = useChatSuggestions(!sessionId);

  // ── live turn (owned by the stream manager, shown as the tail of the conversation) ──
  const streams = useChatStreams((s) => s.streams);
  const liveEntry = useMemo(() => {
    const all = Object.values(streams).filter((e) => e.scope === scope);
    return sessionId ? all.find((x) => x.turn.sessionId === sessionId || x.request.session_id === sessionId) : pendingId ? streams[pendingId] : undefined;
  }, [streams, scope, sessionId, pendingId]);

  // A conversation THIS page just started has no stored history until its first turn finishes: the turn is rendered from
  // the stream, and commitToCache seeds the history cache on completion. Fetching it earlier would flash the loading
  // skeleton over the answer that is streaming (the session id appears mid-stream) and could show the user's message twice.
  // It stays deferred until the finished turn is committed to the cache: enabling the fetch on `done` would race the commit
  // and put the server copy and the live turn on screen together.
  const deferHistory = !!liveEntry && liveEntry.request.session_id == null && !liveEntry.committed
    && (isActive(liveEntry.turn) || liveEntry.turn.phase === "complete");

  // ── server data ──
  const messagesQ = useChatMessages(sessionId, !deferHistory);
  const history = useMemo(() => flattenMessages(messagesQ.data), [messagesQ.data]);

  const live = useMemo(() => {
    // Once the finished turn is in history, history renders it: never both.
    // (Not gated on `committed`: a history fetch can land a render before the commit flag does.)
    if (liveEntry?.turn.phase === "complete" && liveEntry.turn.messageId && history.some((m) => m.id === liveEntry.turn.messageId)) return undefined;
    return liveEntry;
  }, [liveEntry, history]);
  const generatingIds = useMemo(
    () => new Set(Object.values(streams).filter((e) => isActive(e.turn) && e.turn.sessionId).map((e) => e.turn.sessionId as string)),
    [streams],
  );
  const streamingHere = !!live && isActive(live.turn);

  // ── send / retry / stop ──
  // The session id only needs to reach the URL (reload / share / sidebar highlight). A router navigation would re-request
  // the route from the server, remount the page and flash loading.tsx in the middle of the stream, so update the URL in
  // place: Next integrates history.replaceState with usePathname/useSearchParams (no navigation, no remount).
  const bind = useCallback(
    (id: string) => window.history.replaceState(null, "", `${pathname}?session=${encodeURIComponent(id)}`),
    [pathname],
  );
  const send = useCallback(
    (text: string, opts: { clearDraft?: boolean } = {}) => {
      setLocalProblem(null);
      const r = sendChatMessage({ text, sessionId, filters, onSessionBound: sessionId ? undefined : bind });
      if (!r.ok) return setLocalProblem(r.error.message);
      if (!sessionId) setPendingId(r.clientMessageId);
      if (opts.clearDraft) setDraft("");
    },
    [sessionId, filters, bind, setDraft],
  );
  const retryLive = useCallback(() => {
    if (!live) return;
    setLocalProblem(null);
    const r = retryChatMessage(live.turn.clientMessageId, sessionId ? undefined : bind);
    if (!r.ok) setLocalProblem(r.error.message);
  }, [live, sessionId, bind]);

  const newChat = useCallback(() => {
    if (pendingId) dismissChatStream(pendingId);
    setPendingId(null);
    setLocalProblem(null);
    setNavOpen(false);
    router.push(pathname);
  }, [router, pathname, pendingId]);
  const openSession = useCallback((id: string) => {
    setPendingId(null);
    setLocalProblem(null);
    setNavOpen(false);
    router.push(`${pathname}?session=${encodeURIComponent(id)}`);
  }, [router, pathname]);

  // ── composer reasons ──
  const online = useOnline();
  const quota = useChatQuota();
  const now = useNow(!!quota.cooldownUntil);
  const level = quotaLevel(quota, now);
  const cooldownLeft = quota.cooldownUntil && quota.cooldownUntil > now ? Math.ceil((quota.cooldownUntil - now) / 1000) : 0;
  const blockedReason = !online ? chatCopy.offline
    : level === "exhausted" ? chatCopy.quotaExhausted(null)
    : cooldownLeft > 0 ? chatCopy.rateLimited(cooldownLeft)
    : null;

  // ── scrolling ──
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [pill, setPill] = useState(false);
  const prevHeight = useRef<number | null>(null);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (atBottom.current) setPill(false);
  };
  const scrollToBottom = (smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" });
    setPill(false);
  };
  useLayoutEffect(() => {
    atBottom.current = true;
    scrollToBottom();
  }, [sessionId, pendingId]);
  const liveTextLen = live?.turn.text.length ?? 0;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current; // older page prepended: keep the reading position
      prevHeight.current = null;
      return;
    }
    if (atBottom.current) el.scrollTop = el.scrollHeight;
    else if (liveTextLen > 0) requestAnimationFrame(() => setPill(true)); // new content below the fold
  }, [history.length, liveTextLen, live?.turn.phase]);

  // ── screen-reader announcement: derived (stage changes and completion only, never per token) ──
  const announcement = (() => {
    if (!live) return "";
    const t = live.turn;
    const n = t.sources.length;
    if (t.phase === "complete") return t.finishReason === "no_results" ? "No results found." : `Answer ready${n ? `, ${n} source${n === 1 ? "" : "s"}` : ""}`;
    if (t.phase === "stopped") return "Stopped";
    if (t.phase === "failed" || t.phase === "rejected") return "Something went wrong. Retry is available.";
    if (t.stage === "rewriting") return chatCopy.status.rewriting;
    if (t.stage === "searching") return chatCopy.status.searching;
    if (t.stage === "reading") return chatCopy.status.reading(n);
    return "";
  })();

  // ── derived view ──
  const notFound = messagesQ.error instanceof ChatRequestError && messagesQ.error.info.status === 404;
  const unavailableErr = [suggestionsQ.error, messagesQ.error, sessionsQ.error].find(
    (e) => e instanceof ChatRequestError && (e.info.code === "FEATURE_DISABLED" || e.info.code === "FORBIDDEN"),
  ) as ChatRequestError | undefined;
  const isEmpty = !live && history.length === 0 && !messagesQ.isLoading;
  const lastHistoryAssistantIdx = (() => { for (let i = history.length - 1; i >= 0; i--) if (history[i].role === "assistant") return i; return -1; })();

  const sidebar = (
    <SessionSidebar
      sessions={sessions}
      activeId={sessionId}
      generatingIds={generatingIds}
      tz={tz}
      loading={sessionsQ.isLoading}
      hasMore={sessionsQ.hasNextPage}
      onLoadMore={() => void sessionsQ.fetchNextPage()}
      onSelect={openSession}
      onNew={newChat}
      onDeleted={newChat}
    />
  );

  const liveTurn = live?.turn;
  const liveOutcome: TurnOutcome = liveTurn ? deriveOutcome(liveTurn) : "idle";
  const notSent = !!liveTurn && (liveTurn.phase === "rejected" || (liveTurn.phase === "failed" && !liveTurn.messageId));

  return (
    <div className="flex h-[calc(100dvh-var(--topbar-height)-3.5rem)] min-h-[420px] md:h-[calc(100dvh-var(--topbar-height))]">
      <aside className="hidden w-72 shrink-0 border-e border-border md:block">{sidebar}</aside>
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
          <SheetTitle className="sr-only">Conversations</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <section className="relative flex min-w-0 flex-1 flex-col" aria-label="Chat">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <button type="button" className="grid size-9 place-items-center rounded-md hover:bg-surface md:hidden" aria-label="Open conversations" onClick={() => setNavOpen(true)}>
            <Menu className="size-4" aria-hidden />
          </button>
          <Sparkles className="size-4 text-brand" aria-hidden />
          <h1 className="text-sm font-semibold">{chatCopy.title}</h1>
        </header>

        <div className="sr-only" role="status" aria-live="polite">{announcement}</div>

        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="log" aria-label="Conversation" aria-busy={streamingHere}>
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
            {unavailableErr ? (
              <Notice title={unavailableErr.info.code === "FORBIDDEN" ? chatCopy.featureDisabled : "Chat is temporarily unavailable."} body="Please try again later." />
            ) : notFound ? (
              <Notice title={chatCopy.conversationNotFound} body="It may have been deleted." action={{ label: chatCopy.newChat, onClick: newChat }} />
            ) : messagesQ.isLoading && sessionId && !live ? (
              <div className="space-y-4" aria-busy="true" aria-label="Loading conversation">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-surface motion-safe:animate-pulse" />)}</div>
            ) : messagesQ.isError && sessionId ? (
              <Notice title="Couldn't load this conversation." body="Check your connection and try again." action={{ label: chatCopy.retry, onClick: () => void messagesQ.refetch() }} />
            ) : isEmpty && !sessionId ? (
              <EmptyState
                suggestions={suggestionsQ.data?.items ?? []}
                loading={suggestionsQ.isLoading}
                onPick={(q, i) => { chatTelemetry.suggestionClicked({ index: i }); send(q); }}
              />
            ) : (
              <>
                {messagesQ.hasNextPage && (
                  <button
                    type="button"
                    disabled={messagesQ.isFetchingNextPage}
                    onClick={() => { prevHeight.current = scroller.current?.scrollHeight ?? null; void messagesQ.fetchNextPage(); }}
                    className="mx-auto block rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {messagesQ.isFetchingNextPage ? "Loading…" : "Load earlier messages"}
                  </button>
                )}
                {history.map((m, idx) => {
                  if (m.role === "user") return <UserMessage key={m.id} text={m.content} />;
                  const { outcome, incomplete } = outcomeOfRecord(m);
                  const prevUser = [...history.slice(0, idx)].reverse().find((x) => x.role === "user");
                  const retryable = idx === lastHistoryAssistantIdx && !live && incomplete && !!prevUser;
                  return (
                    <AssistantMessage
                      key={m.id}
                      text={m.content}
                      sources={m.sources}
                      outcome={outcome}
                      messageId={m.id}
                      feedback={m.feedback}
                      tz={tz}
                      error={outcome === "error" ? { kind: "stream", code: "INTERNAL", message: "", retryable: true } : null}
                      onRetry={retryable ? () => send(prevUser!.content) : undefined}
                      onAskForRest={idx === lastHistoryAssistantIdx && outcome === "truncated" ? () => send("Please continue your previous answer.") : undefined}
                    />
                  );
                })}
                {liveTurn && (
                  <>
                    <UserMessage text={liveTurn.userText} notSent={notSent} />
                    <AssistantMessage
                      text={liveTurn.text}
                      sources={liveTurn.sources}
                      outcome={liveOutcome === "idle" ? "pending" : liveOutcome}
                      pending={isActive(liveTurn)}
                      turn={liveTurn}
                      error={liveTurn.error}
                      grounded={liveTurn.citations?.grounded}
                      messageId={liveTurn.messageId}
                      tz={tz}
                      onRetry={canRetry(liveTurn) ? retryLive : undefined}
                      onAskForRest={liveOutcome === "truncated" ? () => send("Please continue your previous answer.") : undefined}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {pill && (
          <button type="button" onClick={() => scrollToBottom(true)} className="absolute bottom-28 start-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs shadow-md rtl:translate-x-1/2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <ArrowDown className="size-3.5" aria-hidden />New response
          </button>
        )}

        <QuotaBanner />
        {!unavailableErr && !notFound && (
          <ChatComposer
            value={draft}
            onChange={(v) => { setDraft(v); if (localProblem) setLocalProblem(null); }}
            onSend={() => send(draft, { clearDraft: true })}
            onStop={() => liveTurn && stopChatStream(liveTurn.clientMessageId)}
            streaming={streamingHere}
            blockedReason={blockedReason}
            serverProblem={localProblem ?? (liveTurn?.error?.code === "INVALID_INPUT" ? liveTurn.error.message || null : null)}
            autoFocusKey={sessionId ?? "new"}
          />
        )}
      </section>
    </div>
  );
}

function Notice({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="mx-auto max-w-md space-y-2 py-16 text-center" role="status">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action && <button type="button" onClick={action.onClick} className="mt-2 min-h-9 rounded-md border border-border px-3 text-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{action.label}</button>}
    </div>
  );
}

function EmptyState({ suggestions, loading, onPick }: { suggestions: string[]; loading: boolean; onPick: (q: string, i: number) => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{chatCopy.emptyTitle}</h2>
        <p className="text-sm text-muted-foreground">{chatCopy.emptySubtitle}</p>
      </div>
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-surface motion-safe:animate-pulse" />)}</div>
      ) : (
        <ul className="grid gap-2 text-start sm:grid-cols-2" aria-label="Suggested questions">
          {suggestions.slice(0, 6).map((q, i) => (
            <li key={q}>
              <button type="button" onClick={() => onPick(q, i)} dir="auto" className="min-h-14 w-full rounded-xl border border-border p-3 text-sm transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{q}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChatPage() {
  return (
    <ChatErrorBoundary>
      <ChatPageInner />
    </ChatErrorBoundary>
  );
}
