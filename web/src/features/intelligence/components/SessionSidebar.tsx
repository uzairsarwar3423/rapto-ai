"use client";

import { MessageSquarePlus, Pencil, Search, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { ChatSession } from "@/lib/contracts/chat";
import { useDeleteSession, useRenameSession } from "../api/chatSessionsApi";
import { chatCopy } from "../copy/chatCopy";
import { chatTelemetry } from "../telemetry/chatTelemetry";
import { dayKey } from "../utils/formatTime";

export type SessionGroupLabel = "Today" | "Yesterday" | "Previous 7 days" | "Previous 30 days" | "Older";
const ORDER: SessionGroupLabel[] = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];

/** Group by calendar day in the viewer's timezone (boundaries are correct around midnight). Pure; unit-tested. */
export function groupSessions(sessions: ChatSession[], tz: string | null | undefined, now: Date = new Date()): Array<{ label: SessionGroupLabel; items: ChatSession[] }> {
  const dayMs = 86_400_000;
  const today = Date.parse(`${dayKey(now, tz)}T00:00:00Z`);
  const buckets = new Map<SessionGroupLabel, ChatSession[]>();
  for (const s of sessions) {
    const diff = Math.round((today - Date.parse(`${dayKey(s.updated_at, tz)}T00:00:00Z`)) / dayMs);
    const label: SessionGroupLabel = diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff <= 7 ? "Previous 7 days" : diff <= 30 ? "Previous 30 days" : "Older";
    buckets.set(label, [...(buckets.get(label) ?? []), s]);
  }
  return ORDER.filter((l) => buckets.has(l)).map((label) => ({ label, items: buckets.get(label)! }));
}

interface Props {
  sessions: ChatSession[];
  activeId: string | null;
  generatingIds: ReadonlySet<string>;
  tz?: string | null;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
}

export function SessionSidebar({ sessions, activeId, generatingIds, tz, loading, hasMore, onLoadMore, onSelect, onNew, onDeleted }: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChatSession | null>(null);
  const rename = useRenameSession();
  const del = useDeleteSession();
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sessions.filter((s) => (s.title || "New chat").toLowerCase().includes(q)) : sessions;
  }, [sessions, query]);
  const groups = useMemo(() => groupSessions(filtered, tz), [filtered, tz]);

  const commitRename = (s: ChatSession, raw: string) => {
    setEditing(null);
    const title = raw.trim();
    if (!title || title === s.title) return;
    rename.mutate({ id: s.id, title: title.slice(0, 120) }, {
      onSuccess: () => chatTelemetry.sessionRenamed(),
      onError: () => toast.error("Couldn't rename the chat.", { action: { label: "Retry", onClick: () => commitRename(s, title) } }),
    });
  };

  const onItemKey = (e: KeyboardEvent<HTMLElement>, s: ChatSession) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-session-open]") ?? [])];
    const i = items.indexOf(e.currentTarget);
    if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(i + 1, items.length - 1)]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[Math.max(i - 1, 0)]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === "F2") { e.preventDefault(); setEditing(s.id); }
    else if (e.key === "Delete") { e.preventDefault(); setConfirmDelete(s); }
  };

  return (
    <nav aria-label="Conversations" className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 p-3">
        <button type="button" onClick={onNew} className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <MessageSquarePlus className="size-4" aria-hidden />{chatCopy.newChat}
        </button>
        <label className="relative block">
          <span className="sr-only">Search chats</span>
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" dir="auto" className="h-9 w-full rounded-lg border border-border bg-transparent ps-8 pe-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40" />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading && sessions.length === 0 && (
          <div className="space-y-2 p-2" aria-busy="true" aria-label="Loading conversations">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 rounded-md bg-surface motion-safe:animate-pulse" />)}
          </div>
        )}
        {!loading && sessions.length === 0 && <p className="p-3 text-sm text-muted-foreground">No conversations yet.</p>}
        {sessions.length > 0 && filtered.length === 0 && <p className="p-3 text-sm text-muted-foreground" role="status">No chats match “{query.slice(0, 40)}”.</p>}

        <ul ref={listRef} className="space-y-3">
          {groups.map((g) => (
            <li key={g.label}>
              <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
              <ul>
                {g.items.map((s) => {
                  const active = s.id === activeId;
                  return (
                    <li key={s.id} className={cn("group relative flex items-center rounded-lg", active ? "bg-surface" : "hover:bg-surface/60")}>
                      {editing === s.id ? (
                        <input
                          autoFocus
                          defaultValue={s.title}
                          maxLength={120}
                          dir="auto"
                          aria-label="Chat title"
                          className="m-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                          onBlur={(e) => commitRename(s, e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === "Enter") commitRename(s, e.currentTarget.value);
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            data-session-open
                            aria-current={active ? "page" : undefined}
                            onClick={() => onSelect(s.id)}
                            onKeyDown={(e) => onItemKey(e, s)}
                            className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            <span className="truncate" dir="auto">{s.title || "New chat"}</span>
                            {generatingIds.has(s.id) && <span className="size-1.5 shrink-0 rounded-full bg-brand motion-safe:animate-pulse" role="img" aria-label="Answering" />}
                          </button>
                          <div className="flex shrink-0 items-center pe-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100">
                            <button type="button" aria-label={`Rename ${s.title || "chat"}`} onClick={() => setEditing(s.id)} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [@media(pointer:coarse)]:size-11">
                              <Pencil className="size-3.5" aria-hidden />
                            </button>
                            <button type="button" aria-label={`Delete ${s.title || "chat"}`} onClick={() => setConfirmDelete(s)} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:text-[hsl(var(--danger))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [@media(pointer:coarse)]:size-11">
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        {hasMore && !query && (
          <button type="button" onClick={onLoadMore} className="mt-2 w-full rounded-md py-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Show older chats</button>
        )}
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>“{confirmDelete?.title || "New chat"}” will be removed from your history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const s = confirmDelete;
                if (!s) return;
                del.mutate(s.id, {
                  onSuccess: () => { toast.success("Chat deleted"); if (s.id === activeId) onDeleted(s.id); },
                  onError: () => toast.error("Couldn't delete the chat. Try again."),
                });
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
