"use client"

import React, { useState } from "react"
import { Languages, Loader2, Undo2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { TRANSCRIPT_LANGUAGES } from "../../lib/transcriptLanguage"
import type { TranscriptLanguage } from "../../types"

interface TranscriptLanguageMenuProps {
  /** Language currently on screen for this scope — never offered as a target. */
  currentLanguage: TranscriptLanguage
  /** Set when the scope is showing a translation (enables "Show original" and tints the icon). */
  translatedLanguage: TranscriptLanguage | null
  loading?: boolean
  ariaLabel: string
  onSelect: (language: TranscriptLanguage) => void
  onShowOriginal: () => void
  align?: "start" | "center" | "end"
  className?: string
}

/** Minimal language icon + compact popover, shared by the toolbar (whole transcript) and every speaker turn. */
export function TranscriptLanguageMenu({
  currentLanguage,
  translatedLanguage,
  loading = false,
  ariaLabel,
  onSelect,
  onShowOriginal,
  align = "end",
  className,
}: TranscriptLanguageMenuProps) {
  const [open, setOpen] = useState(false)
  const options = TRANSCRIPT_LANGUAGES.filter((l) => l.code !== currentLanguage)

  const rowClass =
    "flex w-full items-center justify-between gap-6 rounded-md bg-muted/50 px-2.5 py-1.5 text-left text-[13px] text-foreground/90 " +
    "transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none active:bg-muted-foreground/15"

  return (
    <Popover open={open} onOpenChange={(next) => !loading && setOpen(next)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-busy={loading}
          disabled={loading}
          className={cn(
            "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors",
            "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-wait",
            translatedLanguage && "text-primary",
            open && "bg-muted text-foreground",
            className
          )}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className="w-44 gap-1 p-1 shadow-sm ring-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {translatedLanguage && (
          <button
            type="button"
            className={cn(rowClass, "bg-transparent text-muted-foreground")}
            onClick={() => {
              setOpen(false)
              onShowOriginal()
            }}
          >
            <span>Show original</span>
            <Undo2 className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
        {options.map((l) => (
          <button
            key={l.code}
            type="button"
            className={rowClass}
            onClick={() => {
              setOpen(false)
              onSelect(l.code)
            }}
          >
            <span>{l.label}</span>
            <span className="text-[12px] text-muted-foreground" lang={l.code}>
              {l.native}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
