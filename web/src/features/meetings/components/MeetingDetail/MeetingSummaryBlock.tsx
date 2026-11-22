'use client'

import {
  Target,
  AlignLeft,
  Lightbulb,
  MessageSquare,
  CheckCircle2,
  Check,
  Vote,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import React, { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import type { StructuredSummary, TopicSection } from '../../types'
import { SectionLabel } from './SectionLabel'
import { emphasize, stripLeadingBulletChar } from './summaryText'
import { hasSummaryContent, parseStructuredSummary } from '../../lib/summary'

// ─── Report header (AI attribution + language control) ───────────────────────

function ReportHeader({ headerAction }: { headerAction?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      <span className="mtg-label text-xs font-medium">AI meeting report</span>
      {headerAction && <div className="ms-auto">{headerAction}</div>}
    </div>
  )
}

// ─── Key takeaways ───────────────────────────────────────────────────────────

function KeyTakeaways({ items }: { items: string[] }) {
  return (
    <section aria-label="Key Takeaways">
      <div className="rounded-2xl bg-foreground/[0.035] px-5 py-6 sm:px-8 sm:py-8">
        <SectionLabel icon={Lightbulb} count={items.length} className="mb-5">
          Key takeaways
        </SectionLabel>
        <ol className="divide-y divide-border/60">
          {items.map((item, i) => (
            <li key={i} className="flex gap-4 py-4 first:pt-0 last:pb-0">
              <span
                aria-hidden="true"
                className="mt-[5px] w-5 shrink-0 text-[11px] font-medium tabular-nums leading-none text-brand"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="min-w-0 flex-1 break-words text-[15px] leading-[1.7] text-foreground/90">
                {emphasize(stripLeadingBulletChar(item))}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ─── Topics discussed ────────────────────────────────────────────────────────

function TopicRow({
  topic,
  index,
  open,
  onToggle,
}: {
  topic: TopicSection
  index: number
  open: boolean
  onToggle: () => void
}) {
  const uid = useId()
  const panelId = `${uid}-panel`
  const buttonId = `${uid}-button`
  const bullets = topic.bullets ?? []

  return (
    <div>
      <button
        id={buttonId}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="group flex w-full items-start gap-4 py-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
      >
        <span
          aria-hidden="true"
          className="mt-[3px] w-5 shrink-0 text-[11px] font-medium tabular-nums leading-none text-muted-foreground/60"
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 text-[15px] font-medium leading-snug transition-colors duration-200',
            open ? 'text-foreground' : 'text-foreground/85 group-hover:text-foreground'
          )}
        >
          {topic.topic}
        </span>
        {bullets.length > 0 && (
          <span className="mt-[2px] shrink-0 text-xs tabular-nums text-muted-foreground/70">
            {bullets.length} {bullets.length === 1 ? 'point' : 'points'}
          </span>
        )}
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'mt-[1px] h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-300 ease-out rtl:-scale-x-100',
            open && 'rotate-90 rtl:rotate-90'
          )}
          strokeWidth={1.75}
        />
      </button>

      {/* Height animates via grid rows (no measuring, no layout jump) */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
        inert={!open}
      >
        <div className="overflow-hidden">
          {bullets.length > 0 && (
            <ul className="space-y-3 pb-5 ps-9">
              {bullets.map((bullet, i) => (
                <li key={i} className="flex gap-3 text-[14.5px] leading-[1.7] text-foreground/75">
                  <span
                    aria-hidden="true"
                    className="mt-[0.8em] h-px w-2.5 shrink-0 bg-muted-foreground/40"
                  />
                  <span className="min-w-0 flex-1 break-words">
                    {emphasize(stripLeadingBulletChar(bullet))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function TopicsDiscussed({ topics }: { topics: TopicSection[] }) {
  // The first topic opens by default so the section reads as content, not a wall of closed rows.
  const [openSet, setOpenSet] = useState<Set<number>>(() => new Set([0]))
  const allOpen = openSet.size === topics.length

  const toggle = (i: number) =>
    setOpenSet((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <section aria-label="Topics Discussed">
      <SectionLabel
        icon={MessageSquare}
        count={topics.length}
        action={
          topics.length > 1 ? (
            <button
              type="button"
              onClick={() => setOpenSet(allOpen ? new Set() : new Set(topics.map((_, i) => i)))}
              className="text-xs font-normal normal-case tracking-normal text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          ) : undefined
        }
      >
        Topics discussed
      </SectionLabel>
      <div className="divide-y divide-border/60 border-y border-border/60">
        {topics.map((topic, i) => (
          <TopicRow key={i} topic={topic} index={i} open={openSet.has(i)} onToggle={() => toggle(i)} />
        ))}
      </div>
    </section>
  )
}

// ─── Conclusions & decisions ─────────────────────────────────────────────────

function Conclusions({ items }: { items: string[] }) {
  return (
    <section aria-label="Conclusions">
      <SectionLabel icon={CheckCircle2} count={items.length}>
        Conclusions
      </SectionLabel>
      {/* A solid brand rule + heavier type set the outcomes apart from the discussion above */}
      <ul className="space-y-4 border-s-2 border-brand/50 ps-5 sm:ps-6">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <Check
              aria-hidden="true"
              className="mt-[5px] h-4 w-4 shrink-0 text-brand"
              strokeWidth={2.25}
            />
            <p className="min-w-0 flex-1 break-words text-[15.5px] font-medium leading-[1.65] text-foreground">
              {emphasize(stripLeadingBulletChar(item))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Decisions({ items }: { items: string[] }) {
  return (
    <section aria-label="Decisions">
      <SectionLabel icon={Vote} count={items.length}>
        Decisions
      </SectionLabel>
      <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 px-4 py-3.5 sm:px-5">
            <Vote aria-hidden="true" className="mt-[5px] h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <p className="min-w-0 flex-1 break-words text-[15px] font-medium leading-[1.65] text-foreground">
              {emphasize(stripLeadingBulletChar(item))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─── Loading / empty state ───────────────────────────────────────────────────

function SummarySkeleton({ headerAction }: { headerAction?: React.ReactNode }) {
  return (
    <div className="space-y-8">
      <ReportHeader headerAction={headerAction} />
      <div className="space-y-3" aria-hidden="true">
        <div className="h-5 w-3/4 animate-pulse rounded bg-foreground/[0.07]" />
        <div className="h-3.5 w-full animate-pulse rounded bg-foreground/[0.05]" />
        <div className="h-3.5 w-5/6 animate-pulse rounded bg-foreground/[0.05]" />
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-foreground/[0.05]" />
      </div>
      <p className="text-sm text-muted-foreground">
        Summary will appear once the meeting finishes processing.
      </p>
    </div>
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
  /** Optional control rendered at the end of the report header (e.g. the language toggle). */
  headerAction?: React.ReactNode
  /** Render the content right-to-left (Urdu). */
  rtl?: boolean
  lang?: string
}) {
  const structured = parseStructuredSummary(summary)

  if (!structured || !hasSummaryContent(structured)) {
    return <SummarySkeleton headerAction={headerAction} />
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
    <article className="space-y-10 sm:space-y-12">
      <ReportHeader headerAction={headerAction} />

      <div className="space-y-10 sm:space-y-12" dir={rtl ? 'rtl' : undefined} lang={lang}>
        {/* ── Purpose + Overview: the lede ── */}
        {(meeting_purpose || overview) && (
          <div className="space-y-8">
            {meeting_purpose && (
              <section aria-label="Meeting Purpose">
                <SectionLabel icon={Target}>Meeting purpose</SectionLabel>
                <p className="text-balance break-words text-xl font-medium leading-[1.5] tracking-[-0.012em] text-foreground sm:text-[22px]">
                  {meeting_purpose}
                </p>
              </section>
            )}

            {overview && (
              <section aria-label="Overview">
                <SectionLabel icon={AlignLeft}>Overview</SectionLabel>
                <p className="max-w-[68ch] break-words text-[15px] leading-[1.8] text-foreground/80">
                  {overview}
                </p>
              </section>
            )}
          </div>
        )}

        {key_takeaways.length > 0 && <KeyTakeaways items={key_takeaways} />}

        {topics_discussed.length > 0 && <TopicsDiscussed topics={topics_discussed} />}

        {(conclusions.length > 0 || decisions.length > 0) && (
          <div className="space-y-10">
            {conclusions.length > 0 && <Conclusions items={conclusions} />}
            {decisions.length > 0 && <Decisions items={decisions} />}
          </div>
        )}
      </div>
    </article>
  )
}
