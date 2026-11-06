"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { chatCopy } from "../copy/chatCopy";
import { chatTelemetry } from "../telemetry/chatTelemetry";
import { groupCitations, type CitationView } from "../utils/citationModel";

/** "Based on N sources" disclosure; sources grouped by meeting. All strings are rendered as plain text. */
export function SourcesPanel({ citations }: { citations: CitationView[] }) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const groups = useMemo(() => groupCitations(citations), [citations]);
  if (citations.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => {
          if (!open) chatTelemetry.sourcesOpened({ count: citations.length });
          setOpen((o) => !o);
        }}
        className="inline-flex min-h-8 items-center gap-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ChevronRight className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-90")} aria-hidden />
        {chatCopy.sourcesRow(citations.length)}
      </button>
      {open && (
        <div id={regionId} role="region" aria-label="Sources" className="mt-2 space-y-3">
          {groups.map((g) => (
            <section key={g.key} className="rounded-lg border border-border/60 bg-surface/40 p-3">
              <h4 className="text-[13px] font-semibold" dir="auto">{g.title}{g.dateLabel ? <span className="ms-2 font-normal text-muted-foreground">{g.dateLabel}</span> : null}</h4>
              <ul className="mt-2 space-y-2">
                {g.items.map((c) => (
                  <li key={c.id} className="text-[13px]">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md border border-border px-1 text-[11px] tabular-nums" dir="ltr">{c.number}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                          <span>{c.typeLabel}</span>
                          {c.speaker && <span dir="auto">{c.speaker}</span>}
                          {c.unavailable ? (
                            <span>{chatCopy.sourceUnavailable}</span>
                          ) : c.href ? (
                            <Link href={c.href} className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => chatTelemetry.citationClicked({ sourceType: c.kind, position: c.number })}>
                              {c.timeLabel ? `Open at ${c.timeLabel}` : "Open"}
                            </Link>
                          ) : null}
                        </div>
                        {c.preview && <p className="mt-0.5 line-clamp-3 text-foreground/80" dir="auto">{c.preview}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
