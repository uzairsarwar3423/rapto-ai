'use client'

import { Card } from '@/components/ui/card'
import {
  FileText,
  Target,
  AlignLeft,
  Lightbulb,
  MessageSquare,
  CheckCircle2,
  Vote,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import React, { useState } from 'react'
import type { StructuredSummary, TopicSection } from '../../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripLeadingBulletChar(text: string) {
  return text.replace(/^[-*•]\s*/, '').trim()
}

/**
 * Parse incoming summary which may be:
 *   - a StructuredSummary object  (new v4.0)
 *   - a plain string              (legacy v3 plain text)
 *   - null / undefined            (not yet generated)
 */
function parseStructuredSummary(
  raw: StructuredSummary | string | null | undefined
): StructuredSummary | null {
  if (!raw) return null

  if (typeof raw === 'string') {
    // Attempt to parse JSON embedded in a string (edge-case: API stringified it)
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) return parsed as StructuredSummary
    } catch {
      // Not JSON – treat as plain-text overview for backward compat
      return { overview: raw }
    }
  }

  return raw as StructuredSummary
}

function hasContent(summary: StructuredSummary): boolean {
  return !!(
    summary.meeting_purpose ||
    summary.overview ||
    (summary.key_takeaways?.length ?? 0) > 0 ||
    (summary.topics_discussed?.length ?? 0) > 0 ||
    (summary.conclusions?.length ?? 0) > 0 ||
    (summary.decisions?.length ?? 0) > 0
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  count,
  accent = 'brand',
}: {
  icon: React.ElementType
  label: string
  count?: number
  accent?: string
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="p-1.5 rounded-md bg-brand/10 text-brand ring-1 ring-brand/20 shadow-inner">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <h4 className="text-xs font-semibold tracking-tight text-foreground uppercase letter-spacing-wide">
        {label}
      </h4>
      {count !== undefined && count > 0 && (
        <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/40">
          {count}
        </span>
      )}
    </div>
  )
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="group flex gap-2.5 text-sm text-foreground/80 items-start px-2 py-1 -mx-2 rounded-lg hover:bg-muted/30 hover:text-foreground transition-all duration-200"
        >
          <div className="mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full bg-brand/40 group-hover:bg-brand group-hover:scale-110 transition-all duration-300" />
          <span className="flex-1 leading-relaxed break-words">
            {stripLeadingBulletChar(item)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function TopicBlock({ topic }: { topic: TopicSection }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="border border-border/30 rounded-xl overflow-hidden bg-card/60">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors duration-200"
        aria-expanded={expanded}
      >
        <span className="text-xs font-semibold text-foreground/90 leading-relaxed">
          {topic.topic}
        </span>
        <div className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </div>
      </button>
      {expanded && topic.bullets.length > 0 && (
        <div className="px-4 pb-3 pt-1 border-t border-border/20">
          <BulletList items={topic.bullets} />
        </div>
      )}
    </div>
  )
}

// ─── Skeleton (loading state) ─────────────────────────────────────────────────

function SummarySkeleton() {
  return (
    <Card className="p-4 sm:p-5 border-border/40 bg-gradient-to-br from-card to-card/50 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-md bg-brand/10 text-brand">
          <FileText className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Meeting Summary</h3>
      </div>
      <div className="space-y-3">
        <div className="h-3 bg-muted/40 rounded w-3/4 animate-pulse" />
        <div className="h-3 bg-muted/40 rounded w-full animate-pulse" />
        <div className="h-3 bg-muted/40 rounded w-5/6 animate-pulse" />
        <div className="h-3 bg-muted/40 rounded w-1/2 animate-pulse" />
      </div>
      <p className="mt-4 text-xs text-muted-foreground italic pl-1">
        Summary will appear once the meeting finishes processing.
      </p>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MeetingSummaryBlock({
  summary,
  headerAction,
  rtl = false,
  lang,
}: {
  summary: StructuredSummary | string | null | undefined
  /** Optional control rendered at the end of the card header (e.g. the language toggle). */
  headerAction?: React.ReactNode
  /** Render the content right-to-left (Urdu). */
  rtl?: boolean
  lang?: string
}) {
  const structured = parseStructuredSummary(summary)

  if (!structured || !hasContent(structured)) {
    return <SummarySkeleton />
  }

  const {
    meeting_purpose,
    overview,
    key_takeaways = [],
    topics_discussed = [],
    conclusions = [],
    decisions = [],
  } = structured

  return (
    <Card className="border-border/40 bg-gradient-to-br from-card to-card/50 shadow-sm transition-all duration-300 group/card hover:shadow-md overflow-hidden">
      {/* ── Card Header ── */}
      <div className="flex items-center gap-2 px-4 sm:px-5 pt-4 sm:pt-5 pb-4 border-b border-border/30">
        <div className="p-1.5 rounded-md bg-brand/10 text-brand ring-1 ring-brand/20 shadow-inner group-hover/card:bg-brand/15 transition-colors duration-300">
          <FileText className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Meeting Summary</h3>
        {headerAction && <div className="ml-auto">{headerAction}</div>}
      </div>

      <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-6" dir={rtl ? 'rtl' : undefined} lang={lang}>

        {/* ── Meeting Purpose ── */}
        {meeting_purpose && (
          <section aria-label="Meeting Purpose">
            <SectionHeader icon={Target} label="Meeting Purpose" />
            <p className="text-sm text-foreground/80 leading-relaxed pl-1">
              {meeting_purpose}
            </p>
          </section>
        )}

        {/* ── Overview ── */}
        {overview && (
          <section aria-label="Overview">
            <SectionHeader icon={AlignLeft} label="Overview" />
            <p className="text-sm text-foreground/80 leading-relaxed pl-1">
              {overview}
            </p>
          </section>
        )}

        {/* ── Key Takeaways ── */}
        {key_takeaways.length > 0 && (
          <section aria-label="Key Takeaways">
            <SectionHeader icon={Lightbulb} label="Key Takeaways" count={key_takeaways.length} />
            <BulletList items={key_takeaways} />
          </section>
        )}

        {/* ── Topics Discussed ── */}
        {topics_discussed.length > 0 && (
          <section aria-label="Topics Discussed">
            <SectionHeader
              icon={MessageSquare}
              label="Topics Discussed"
              count={topics_discussed.length}
            />
            <div className="space-y-2">
              {topics_discussed.map((topic, i) => (
                <TopicBlock key={i} topic={topic} />
              ))}
            </div>
          </section>
        )}

        {/* ── Conclusions ── */}
        {conclusions.length > 0 && (
          <section aria-label="Conclusions">
            <SectionHeader icon={CheckCircle2} label="Conclusions" count={conclusions.length} />
            <BulletList items={conclusions} />
          </section>
        )}

        {/* ── Decisions ── */}
        {decisions.length > 0 && (
          <section aria-label="Decisions">
            <SectionHeader icon={Vote} label="Decisions" count={decisions.length} />
            <ul className="space-y-2">
              {decisions.map((decision, i) => (
                <li
                  key={i}
                  className="group flex gap-3 text-sm text-foreground p-3 rounded-xl hover:bg-muted/40 border border-transparent hover:border-border/50 transition-all duration-200 ease-out"
                >
                  <div className="mt-0.5 flex-shrink-0">
                    <div className="w-5 h-5 rounded-full bg-background border border-brand/30 flex items-center justify-center group-hover:scale-110 group-hover:border-brand/50 group-hover:bg-brand/5 transition-all duration-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand/60 group-hover:bg-brand transition-colors" />
                    </div>
                  </div>
                  <span className="flex-1 text-foreground/90 font-medium leading-relaxed group-hover:text-foreground transition-colors break-words">
                    {stripLeadingBulletChar(decision)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

      </div>
    </Card>
  )
}
