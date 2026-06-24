"use client"

import React, { useRef, useEffect, useState } from "react"
import { Search, ChevronDown, ChevronUp, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface TranscriptSearchProps {
  value: string
  onChange: (value: string) => void
  onNext: () => void
  onPrev: () => void
  matchCount: number
  currentMatchIndex: number
  onClear: () => void
  isScrolled?: boolean
}

export function TranscriptSearch({
  value,
  onChange,
  onNext,
  onPrev,
  matchCount,
  currentMatchIndex,
  onClear,
  isScrolled = false,
}: TranscriptSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fadeCount, setFadeCount] = useState(matchCount)
  const [fadeIndex, setFadeIndex] = useState(currentMatchIndex)
  const [isFading, setIsFading] = useState(false)

  // Fade transition for match numbers to avoid layout jitter
  useEffect(() => {
    if (matchCount !== fadeCount || currentMatchIndex !== fadeIndex) {
      setIsFading(true)
      const timer = setTimeout(() => {
        setFadeCount(matchCount)
        setFadeIndex(currentMatchIndex)
        setIsFading(false)
      }, 80) // 80ms fade out, then swap and fade in
      return () => clearTimeout(timer)
    }
  }, [matchCount, currentMatchIndex, fadeCount, fadeIndex])

  // Global keyboard shortcut: '/' or 'Cmd+F' / 'Ctrl+F' programmatically focuses search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)

      if (isInput) {
        if (e.key === "Escape" && inputRef.current === target) {
          inputRef.current.blur()
          onClear()
        }
        return
      }

      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "f")) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClear])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (e.shiftKey) {
        onPrev()
      } else {
        onNext()
      }
    }
  }

  const hasMatches = matchCount > 0
  const displayIndex = fadeIndex + 1

  return (
    <div className="flex flex-1 items-center justify-between gap-4 max-w-full">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-70" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search transcript... (Press '/' to focus)"
          className="w-full h-9 pl-9 pr-8 font-sans text-sm bg-transparent border border-border rounded-radius outline-none transition-all placeholder:text-muted-subtle focus:border-brand focus:ring-2 focus:ring-brand/20 duration-120"
        />
        {value && (
          <button
            onClick={onClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {value.trim().length >= 2 && (
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={cn(
              "font-sans text-[12px] font-semibold text-muted-foreground tabular-nums transition-opacity duration-80",
              isFading ? "opacity-0" : "opacity-100"
            )}
          >
            {hasMatches ? `${displayIndex} of ${fadeCount}` : "No matches"}
          </span>

          <div className="flex items-center gap-0.5 border border-border rounded-md bg-muted/20">
            <button
              onClick={onPrev}
              disabled={!hasMatches}
              className="p-1 hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent rounded-l-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:cursor-not-allowed"
              aria-label="Previous match"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-border" />
            <button
              onClick={onNext}
              disabled={!hasMatches}
              className="p-1 hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent rounded-r-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:cursor-not-allowed"
              aria-label="Next match"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
