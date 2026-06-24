"use client"

import React from "react"
import { Filter, X } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface TranscriptSpeakerFilterProps {
  speakers: { name: string; count: number }[]
  selectedSpeaker: string | null
  onSelect: (speaker: string | null) => void
}

export function TranscriptSpeakerFilter({
  speakers,
  selectedSpeaker,
  onSelect,
}: TranscriptSpeakerFilterProps) {
  if (speakers.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 h-8 px-3 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted/50 transition-colors cursor-pointer">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => onSelect(null)} className="cursor-pointer">
            All speakers
          </DropdownMenuItem>
          {speakers.map((speaker) => (
            <DropdownMenuItem
              key={speaker.name}
              onClick={() => onSelect(speaker.name)}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="truncate pr-2">{speaker.name}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">({speaker.count})</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedSpeaker && (
        <span
          className="h-8 px-2.5 py-1 flex items-center gap-1.5 font-medium rounded-md bg-muted text-foreground border border-border shrink-0"
        >
          <span className="text-[13px] truncate max-w-[120px]">{selectedSpeaker}</span>
          <button
            onClick={() => onSelect(null)}
            className="p-0.5 hover:bg-background/80 rounded-sm transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Clear filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}
    </div>
  )
}
