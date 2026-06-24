"use client"

import React from "react"
import { TranscriptSearch } from "./TranscriptSearch"
import { TranscriptSpeakerFilter } from "./TranscriptSpeakerFilter"
import { cn } from "@/lib/utils"

interface TranscriptToolbarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  onSearchNext: () => void
  onSearchPrev: () => void
  searchMatchCount: number
  searchCurrentMatchIndex: number
  onSearchClear: () => void

  speakers: { name: string; count: number }[]
  selectedSpeaker: string | null
  onSpeakerSelect: (speaker: string | null) => void

  totalTurns: number
  isScrolled?: boolean
}

export function TranscriptToolbar({
  searchValue,
  onSearchChange,
  onSearchNext,
  onSearchPrev,
  searchMatchCount,
  searchCurrentMatchIndex,
  onSearchClear,

  speakers,
  selectedSpeaker,
  onSpeakerSelect,

  totalTurns,
  isScrolled = false,
}: TranscriptToolbarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 px-4 py-3 bg-background border-b border-border transition-all duration-200",
        isScrolled && "shadow-sm bg-background/95 backdrop-blur-sm"
      )}
    >
      <div className="flex-1 min-w-0 w-full">
        <TranscriptSearch
          value={searchValue}
          onChange={onSearchChange}
          onNext={onSearchNext}
          onPrev={onSearchPrev}
          matchCount={searchMatchCount}
          currentMatchIndex={searchCurrentMatchIndex}
          onClear={onSearchClear}
          isScrolled={isScrolled}
        />
      </div>

      <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 w-full md:w-auto">
        <TranscriptSpeakerFilter
          speakers={speakers}
          selectedSpeaker={selectedSpeaker}
          onSelect={onSpeakerSelect}
        />
        <div className="hidden md:block w-px h-4 bg-border" />
        <span className="font-sans text-[12px] text-muted-foreground tabular-nums shrink-0">
          {totalTurns} turns
        </span>
      </div>
    </div>
  )
}
