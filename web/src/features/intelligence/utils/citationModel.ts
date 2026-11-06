/**
 * citationModel.ts
 * ────────────────
 * Turns the `sources` of ONE message into view-models for chips, the sources row/drawer and exports, and decides where
 * each citation links.
 *
 * Deep links (B8) are the only place user-visible navigation is generated. Rules:
 *  - routes are built from a FIXED table of app-internal paths; ids are validated against the backend id grammar and
 *    percent-encoded; no source field is ever used as a URL, so there is no open-redirect / `javascript:` surface;
 *  - a redacted source (the viewer lost access to the meeting) never links and shows "Source no longer available";
 *  - a transcript source links to `/meetings/{id}/transcript?t={seconds}`; the transcript viewer scrolls to and
 *    highlights that moment. (The backend does not yet send turn ids — `highlight` is a pending §3.3 amendment — so
 *    timestamp-only is the documented fallback.)
 */
import { ID_PATTERN, type SourceItem } from "@/lib/contracts/chat";
import { formatDate, formatTimestamp, msToSeconds } from "./formatTime";

export type CitationKind = "transcript" | "commitment" | "action_item" | "decision" | "summary" | "analytics" | "other";

export interface CitationView {
  /** `S3` */
  id: string;
  /** 3 — the visible number on the chip. */
  number: number;
  kind: CitationKind;
  typeLabel: string;
  title: string;
  speaker: string | null;
  /** `12:03` / `1:02:03`, transcript sources only. */
  timeLabel: string | null;
  dateLabel: string | null;
  /** Plain text. ALWAYS rendered as text, never as markup. */
  preview: string;
  /** Internal route, or null when the source cannot be opened. */
  href: string | null;
  unavailable: boolean;
  meetingId: string | null;
  /** Screen-reader name: "Source 2: Weekly Standup, 12:03, Ahmed". */
  accessibleName: string;
  /** Short visible label for list rows: "Weekly Standup · 12:03". */
  label: string;
  startMs: number | null;
}

const KIND_BY_TYPE: Record<string, CitationKind> = {
  transcript_chunk: "transcript",
  commitment: "commitment",
  action_item: "action_item",
  decision: "decision",
  summary: "summary",
  digest: "summary",
  analytics: "analytics",
};

const TYPE_LABEL: Record<CitationKind, string> = {
  transcript: "Transcript",
  commitment: "Commitment",
  action_item: "Action item",
  decision: "Decision",
  summary: "Summary",
  analytics: "Metric",
  other: "Source",
};

const ANALYTICS_LABEL: Record<string, string> = {
  count_commitments: "Commitment count",
  list_overdue_commitments: "Overdue commitments",
  commitment_completion_rate: "Completion rate",
  top_owners_by_open_commitments: "Open commitments by owner",
  meeting_count: "Meeting count",
  find_commitments: "Commitment search",
};

const isId = (v: unknown): v is string => typeof v === "string" && ID_PATTERN.test(v);
const enc = encodeURIComponent;

/** The commitments list understands these statuses; chat's "overdue" is derived, so it maps to the open list. */
const COMMITMENT_STATUS: Record<string, string> = { open: "PENDING", overdue: "PENDING", completed: "FULFILLED" };

function analyticsHref(source: SourceItem): string | null {
  const tool = source.tool ?? "";
  const p = (source.params ?? {}) as Record<string, unknown>;
  const owners = Array.isArray(p.owner_ids) ? p.owner_ids.filter(isId).slice(0, 10) : [];
  const qs = (entries: Record<string, string | undefined>) => {
    const q = Object.entries(entries).filter(([, v]) => v).map(([k, v]) => `${k}=${enc(v as string)}`).join("&");
    return q ? `?${q}` : "";
  };
  switch (tool) {
    case "count_commitments":
      return `/commitments${qs({ status: COMMITMENT_STATUS[String(p.status ?? "open")], ownerIds: owners.join(",") || undefined })}`;
    case "list_overdue_commitments":
      return `/commitments${qs({ status: "PENDING", ownerIds: owners.join(",") || undefined })}`;
    case "find_commitments":
      return `/commitments${qs({ ownerIds: owners.join(",") || undefined })}`;
    case "commitment_completion_rate":
    case "top_owners_by_open_commitments":
      return "/commitments";
    case "meeting_count":
      return "/meetings";
    default:
      return null; // unknown tool: no matching route, so no link
  }
}

export function sourceHref(source: SourceItem): string | null {
  if (source.redacted) return null;
  const kind = KIND_BY_TYPE[source.type] ?? "other";
  if (kind === "analytics") return analyticsHref(source);

  const meetingId = isId(source.meeting_id) ? source.meeting_id : null;
  switch (kind) {
    case "transcript":
      if (!meetingId) return null;
      return source.start_ms != null && source.start_ms >= 0
        ? `/meetings/${enc(meetingId)}/transcript?t=${msToSeconds(source.start_ms)}`
        : `/meetings/${enc(meetingId)}/transcript`;
    case "commitment":
      if (isId(source.commitment_id)) return `/commitments/${enc(source.commitment_id)}`;
      return meetingId ? `/meetings/${enc(meetingId)}/commitments` : null;
    case "action_item":
      return meetingId ? `/meetings/${enc(meetingId)}/action-items` : null;
    case "decision":
    case "summary":
      return meetingId ? `/meetings/${enc(meetingId)}` : null;
    default:
      return meetingId ? `/meetings/${enc(meetingId)}` : null;
  }
}

export function toCitationView(source: SourceItem, tz?: string | null): CitationView {
  const kind = KIND_BY_TYPE[source.type] ?? "other";
  const number = Number(source.source_id.slice(1));
  const href = sourceHref(source);
  const meetingNeeded = kind !== "analytics";
  const unavailable = source.redacted || (meetingNeeded && href === null);

  const title =
    kind === "analytics"
      ? ANALYTICS_LABEL[source.tool ?? ""] ?? "Metric"
      : source.meeting_title?.trim() || (kind === "commitment" ? "Commitment" : "Meeting");
  const timeLabel = kind === "transcript" ? formatTimestamp(source.start_ms) : null;
  const dateLabel = formatDate(kind === "analytics" ? source.as_of : source.occurred_at, tz);
  const speaker = source.speaker?.trim() || null;
  const label = timeLabel ? `${title} · ${timeLabel}` : title;
  const accessibleName = unavailable
    ? `Source ${number}: no longer available`
    : `Source ${number}: ${[title, timeLabel, speaker].filter(Boolean).join(", ")}`;

  return {
    id: source.source_id, number, kind, typeLabel: TYPE_LABEL[kind], title, speaker, timeLabel, dateLabel,
    preview: source.redacted ? "" : source.preview ?? "",
    href: unavailable ? null : href, unavailable,
    meetingId: isId(source.meeting_id) ? source.meeting_id : null,
    accessibleName, label, startMs: source.start_ms ?? null,
  };
}

export function buildCitations(sources: SourceItem[], tz?: string | null): CitationView[] {
  return sources.map((s) => toCitationView(s, tz));
}

export const citationIds = (views: CitationView[]): Set<string> => new Set(views.map((v) => v.id));

export interface CitationGroup {
  key: string;
  title: string;
  dateLabel: string | null;
  kind: "meeting" | "analytics";
  items: CitationView[];
}

/** Group by meeting in order of first appearance; analytics sources form their own group. */
export function groupCitations(views: CitationView[]): CitationGroup[] {
  const groups = new Map<string, CitationGroup>();
  for (const v of views) {
    const key = v.kind === "analytics" ? "analytics" : v.meetingId ? `m:${v.meetingId}` : `u:${v.id}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, title: v.kind === "analytics" ? "Calculated metrics" : v.title, dateLabel: v.kind === "analytics" ? null : v.dateLabel, kind: v.kind === "analytics" ? "analytics" : "meeting", items: [] };
      groups.set(key, g);
    }
    g.items.push(v);
  }
  return [...groups.values()];
}
