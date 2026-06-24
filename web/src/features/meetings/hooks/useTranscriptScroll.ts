"use client"

import { useState, useCallback } from "react"
import { Virtualizer } from "@tanstack/react-virtual"

interface TurnData {
  id: string
  start_time: number
  [key: string]: any
}

export function useTranscriptScroll(
  turns: TurnData[],
  getVirtualizer: () => Virtualizer<HTMLDivElement, Element> | null
) {
  const [pulseId, setPulseId] = useState<string | null>(null)

  const jumpToTime = useCallback((seconds: number) => {
    const virtualizer = getVirtualizer()
    if (!virtualizer || turns.length === 0) return

    let low = 0
    let high = turns.length - 1
    let closestIndex = 0
    let minDiff = Infinity

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const turn = turns[mid]
      const diff = Math.abs(turn.start_time - seconds)

      if (diff < minDiff) {
        minDiff = diff
        closestIndex = mid
      }

      if (turn.start_time === seconds) {
        closestIndex = mid
        break
      } else if (turn.start_time < seconds) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    const targetTurn = turns[closestIndex]
    if (targetTurn) {
      setPulseId(targetTurn.id)
      virtualizer.scrollToIndex(closestIndex, { align: "center" })

      // Clear pulse after 600ms
      setTimeout(() => {
        setPulseId((current) => (current === targetTurn.id ? null : current))
      }, 600)
    }
  }, [turns, getVirtualizer])

  return {
    pulseId,
    jumpToTime,
  }
}
