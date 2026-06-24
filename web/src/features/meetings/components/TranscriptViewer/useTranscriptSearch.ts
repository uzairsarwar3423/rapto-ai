"use client"

import { useState, useMemo, useCallback, useEffect } from "react"

interface Turn {
  id: string
  text: string
  [key: string]: any
}

export function useTranscriptSearch(turns: Turn[]) {
  const [query, setQuery] = useState("")
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)

  const clearSearch = useCallback(() => {
    setQuery("")
    setCurrentMatchIndex(-1)
  }, [])

  // Compute matched indices in one O(N) pass
  const searchResults = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed || trimmed.length < 2) return []

    const lowerQuery = trimmed.toLowerCase()
    const matches: number[] = []

    for (let i = 0; i < turns.length; i++) {
      if (turns[i].text.toLowerCase().includes(lowerQuery)) {
        matches.push(i)
      }
    }

    return matches
  }, [turns, query])

  // Reset or initialize match index when search results change
  useEffect(() => {
    if (searchResults.length > 0) {
      setCurrentMatchIndex(0)
    } else {
      setCurrentMatchIndex(-1)
    }
  }, [searchResults])

  const goToNextMatch = useCallback(() => {
    if (searchResults.length === 0) return
    setCurrentMatchIndex((prev) => (prev + 1) % searchResults.length)
  }, [searchResults])

  const goToPrevMatch = useCallback(() => {
    if (searchResults.length === 0) return
    setCurrentMatchIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length)
  }, [searchResults])

  return {
    searchQuery: query,
    setSearchQuery: setQuery,
    searchResults,
    currentMatchIndex,
    goToNextMatch,
    goToPrevMatch,
    clearSearch,
  }
}
