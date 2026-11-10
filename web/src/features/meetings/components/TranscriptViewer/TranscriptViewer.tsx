"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { Virtualizer } from "@tanstack/react-virtual"
import { VirtualList } from "@/shared/components/data-display/VirtualList"
import { TranscriptToolbar } from "./TranscriptToolbar"
import { TranscriptTurn } from "./TranscriptTurn"
import { TranscriptEmptyState } from "./TranscriptEmptyState"
import { TranscriptLanguageMenu } from "./TranscriptLanguageMenu"
import { useTranscriptSearch } from "./useTranscriptSearch"
import { useTranscriptScroll } from "../../hooks/useTranscriptScroll"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

import { useTranscript } from "../../hooks/useTranscript"
import { useMeetingDetail } from "../../hooks/useMeetingDetail"
import { useTranscriptTranslation } from "../../hooks/useTranscriptTranslation"
import { detectScriptLanguage } from "../../lib/transcriptLanguage"
import type { TranscriptLanguage } from "../../types"

interface TranscriptData {
  id: string
  meeting_id: string
  raw_transcript: any[]
  normalized_transcript?: any[]
  processing_status: string
}

interface TranscriptViewerProps {
  meetingId?: string
  transcript: TranscriptData | null
  meetingStatus: string
  onRetry?: () => void
}

export function TranscriptViewer({
  meetingId,
  transcript: initialTranscript,
  meetingStatus: initialStatus,
  onRetry,
}: TranscriptViewerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null)

  // Real-time meeting detail synchronization
  const { data: liveMeeting } = useMeetingDetail(meetingId || "", null)
  const currentStatus = liveMeeting?.status || initialStatus

  const transcriptReadyStates = [
    "DONE", 
    "RESOLVED", 
    "RESOLUTION_FAILED", 
    "EXTRACTION_FAILED", 
    "EXTRACTED", 
    "EXTRACTED_PARTIAL",
    "TRANSCRIPT_CLEANED",
    "TRANSCRIPT_CLEANUP_FAILED",
    "TRANSCRIPT_CLEANUP_DEGRADED",
    "TRANSCRIBED"
  ]
  const isReady = transcriptReadyStates.includes(currentStatus)

  // Real-time transcript fetch when ready
  const { data: clientTranscript } = useTranscript(
    meetingId || "",
    Boolean(meetingId) && isReady && !initialTranscript
  )
  const transcript = clientTranscript || initialTranscript

  // Virtualizer instance reference
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null)
  const getVirtualizer = useCallback(() => virtualizerRef.current, [])

  // 1. Map raw or normalized backend transcript turns to expected TranscriptTurn structure
  const turns = useMemo(() => {
    if (!transcript) return []

    // Use normalized_transcript if available and non-empty, otherwise raw_transcript
    const sourceTurns: any[] =
      Array.isArray(transcript.normalized_transcript) &&
      transcript.normalized_transcript.length > 0
        ? transcript.normalized_transcript
        : Array.isArray(transcript.raw_transcript)
        ? transcript.raw_transcript
        : []

    return sourceTurns.map((turn: any, index: number) => {
      // 1. Resolve Speaker Name
      let speaker = "Unknown Speaker"
      if (turn.speaker) {
        speaker = turn.speaker
      } else if (turn.speaker_name) {
        speaker = turn.speaker_name
      } else if (turn.participant?.name) {
        speaker = turn.participant.name
      } else if (turn.speaker_tag) {
        speaker = turn.speaker_tag
      }

      // 2. Resolve Speaker ID
      const speakerId = turn.speaker_user_id || turn.speakerId || undefined

      // 3. Resolve Text
      let text = ""
      if (typeof turn.cleaned_text === "string") {
        text = turn.cleaned_text
      } else if (typeof turn.text === "string") {
        text = turn.text
      } else if (Array.isArray(turn.words)) {
        text = turn.words.map((w: any) => w.text).join(" ").trim()
      }

      // 4. Resolve Start Time
      let start_time = 0
      if (typeof turn.startTime === "number") {
        start_time = turn.startTime
      } else if (typeof turn.start_time === "number") {
        start_time = turn.start_time
      } else if (typeof turn.start_timestamp === "number") {
        start_time = turn.start_timestamp
      } else if (turn.start_timestamp && typeof turn.start_timestamp.relative === "number") {
        start_time = turn.start_timestamp.relative
      } else if (Array.isArray(turn.words) && turn.words.length > 0) {
        const firstWord = turn.words[0]
        start_time =
          typeof firstWord.start_time === "number"
            ? firstWord.start_time
            : typeof firstWord.start_timestamp === "number"
            ? firstWord.start_timestamp
            : firstWord.start_timestamp?.relative || 0
      }

      // 5. Resolve End Time
      let end_time = 0
      if (typeof turn.endTime === "number") {
        end_time = turn.endTime
      } else if (typeof turn.end_time === "number") {
        end_time = turn.end_time
      } else if (typeof turn.end_timestamp === "number") {
        end_time = turn.end_timestamp
      } else if (turn.end_timestamp && typeof turn.end_timestamp.relative === "number") {
        end_time = turn.end_timestamp.relative
      } else if (Array.isArray(turn.words) && turn.words.length > 0) {
        const lastWord = turn.words[turn.words.length - 1]
        end_time =
          typeof lastWord.end_time === "number"
            ? lastWord.end_time
            : typeof lastWord.end_timestamp === "number"
            ? lastWord.end_timestamp
            : lastWord.end_timestamp?.relative || 0
      }

      return {
        // Must match the API's segment-id derivation exactly (translations are re-joined by id).
        id: String(turn.id || turn.turn_id || `turn-${index}`),
        speaker,
        speakerId,
        confidence: turn.confidence !== undefined ? turn.confidence : 1.0,
        text,
        start_time,
        end_time,
      }
    })
  }, [transcript])

  // 1b. Translation overlay - display-only; `turns` (the original) is never mutated.
  const translation = useTranscriptTranslation(meetingId || "")
  const { displayText, translatedLanguageOf, translate, showOriginal } = translation

  const displayTurns = useMemo(
    () =>
      turns.map((t) => {
        const text = displayText(t)
        return text === t.text ? t : { ...t, text }
      }),
    [turns, displayText]
  )

  // Language each speaker (and the transcript as a whole) was spoken in - drives which targets the menu offers.
  const originalLanguages = useMemo(() => {
    const bySpeaker: Record<string, string[]> = {}
    for (const t of turns) (bySpeaker[t.speaker] ||= []).push(t.text)
    const perSpeaker: Record<string, TranscriptLanguage> = {}
    for (const [name, texts] of Object.entries(bySpeaker)) perSpeaker[name] = detectScriptLanguage(texts.join("\n"))
    return { all: detectScriptLanguage(turns.map((t) => t.text).join("\n")), perSpeaker }
  }, [turns])

  const handleTranslateSpeaker = useCallback(
    (speaker: string, language: TranscriptLanguage) => void translate(language, speaker),
    [translate]
  )
  const handleSpeakerOriginal = useCallback((speaker: string) => showOriginal(speaker), [showOriginal])

  // 2. Compute list of unique speakers with turn counts for the filter dropdown
  const speakers = useMemo(() => {
    const counts: Record<string, number> = {}
    turns.forEach((t) => {
      counts[t.speaker] = (counts[t.speaker] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [turns])

  // 3. Filter turns list based on current speaker selection
  const filteredTurns = useMemo(() => {
    if (!selectedSpeaker) return displayTurns
    return displayTurns.filter((t) => t.speaker === selectedSpeaker)
  }, [displayTurns, selectedSpeaker])

  // 4. Initialize search capabilities on the (filtered) turns list
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    currentMatchIndex,
    goToNextMatch,
    goToPrevMatch,
    clearSearch,
  } = useTranscriptSearch(filteredTurns)

  // 5. Initialize jump-to-time capabilities and temporal pulse highlighting
  const { pulseId, jumpToTime } = useTranscriptScroll(filteredTurns, getVirtualizer)

  // 5b. Deep link from chat citations: ?t=<seconds> scrolls to and pulses the turn at that moment (once per value).
  const searchParams = useSearchParams()
  const deepLinkT = searchParams.get("t")
  const handledDeepLink = useRef<string | null>(null)
  useEffect(() => {
    if (deepLinkT === null || handledDeepLink.current === deepLinkT || filteredTurns.length === 0) return
    if (!/^d{1,7}$/.test(deepLinkT)) return
    const timer = setTimeout(() => {
      // Wait a tick so the virtualizer has mounted; a stale/out-of-range time lands on the nearest turn.
      if (!virtualizerRef.current) return
      handledDeepLink.current = deepLinkT
      jumpToTime(Number(deepLinkT))
    }, 150)
    return () => clearTimeout(timer)
  }, [deepLinkT, filteredTurns.length, jumpToTime])

  // 6. Monitor scroll position of the custom viewport to elevate sticky header
  useEffect(() => {
    const viewport = scrollRef.current
    if (!viewport) return

    const handleScroll = () => {
      setIsScrolled(viewport.scrollTop > 0)
    }

    viewport.addEventListener("scroll", handleScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [])

  // 7. Scroll to current search match
  useEffect(() => {
    const virtualizer = virtualizerRef.current
    if (virtualizer && currentMatchIndex >= 0 && searchResults.length > 0) {
      const targetIndex = searchResults[currentMatchIndex]
      virtualizer.scrollToIndex(targetIndex, { align: "center", behavior: "smooth" })
    }
  }, [currentMatchIndex, searchResults])

  // Handle copying turn text to clipboard
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        toast.success("Transcript snippet copied successfully.")
      },
      () => {
        toast.error("Could not copy text to clipboard.")
      }
    )
  }, [])

  // Handle virtualizer mounting callback
  const handleVirtualizerMount = useCallback((v: Virtualizer<HTMLDivElement, Element>) => {
    virtualizerRef.current = v
  }, [])

  // Expose jumpToTime globally on window in development for ease of testing
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      ;(window as any).jumpToTranscriptTime = jumpToTime
    }
    return () => {
      if (process.env.NODE_ENV === "development") {
        delete (window as any).jumpToTranscriptTime
      }
    }
  }, [jumpToTime])

  if (!isReady || !transcript) {
    return <TranscriptEmptyState status={currentStatus} onRetry={onRetry} />
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[450px] border border-border rounded-lg bg-background overflow-hidden">
      <TranscriptToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchNext={goToNextMatch}
        onSearchPrev={goToPrevMatch}
        searchMatchCount={searchResults.length}
        searchCurrentMatchIndex={currentMatchIndex}
        onSearchClear={clearSearch}
        speakers={speakers}
        selectedSpeaker={selectedSpeaker}
        onSpeakerSelect={setSelectedSpeaker}
        totalTurns={filteredTurns.length}
        isScrolled={isScrolled}
        languageMenu={
          meetingId ? (
            <TranscriptLanguageMenu
              currentLanguage={translation.fullLang ?? originalLanguages.all}
              translatedLanguage={translation.fullLang}
              loading={translation.isFullPending}
              ariaLabel="Translate full transcript"
              onSelect={(lang) => void translate(lang)}
              onShowOriginal={() => showOriginal()}
            />
          ) : null
        }
      />

      <div className="flex-1 min-h-0 relative">
        <VirtualList
          items={filteredTurns}
          estimateSize={() => 72}
          overscan={8}
          scrollRef={scrollRef}
          getItemKey={(turn) => turn.id}
          className="h-full w-full"
          onVirtualizerMount={handleVirtualizerMount}
          renderItem={(turn, index) => {
            const isMatch = searchResults.includes(index)
            const isActiveMatch =
              isMatch && currentMatchIndex >= 0 && searchResults[currentMatchIndex] === index

            return (
              <div
                className={cn(
                  "transition-colors duration-300",
                  pulseId === turn.id && "bg-primary/10 animate-pulse"
                )}
              >
                <TranscriptTurn
                  turn={turn}
                  isHighlighted={isMatch}
                  isActiveMatch={isActiveMatch}
                  searchQuery={searchQuery}
                  onCopy={handleCopy}
                  translating={translation.isFullPending || translation.isSpeakerPending(turn.speaker)}
                  translatedLanguage={translatedLanguageOf(turn.speaker)}
                  currentLanguage={translatedLanguageOf(turn.speaker) ?? originalLanguages.perSpeaker[turn.speaker] ?? "en"}
                  onTranslate={meetingId ? handleTranslateSpeaker : undefined}
                  onShowOriginal={handleSpeakerOriginal}
                />
              </div>
            )
          }}
        />
      </div>
    </div>
  )
}
