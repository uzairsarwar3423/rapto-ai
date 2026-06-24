import React from "react"
import { cn } from "@/lib/utils"

interface TranscriptSearchHighlightProps {
  text: string
  query: string
  isActive?: boolean
}

export function TranscriptSearchHighlight({
  text,
  query,
  isActive = false,
}: TranscriptSearchHighlightProps) {
  if (!query) return <>{text}</>

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const parts: { text: string; isMatch: boolean }[] = []

  let startIndex = 0
  let index = lowerText.indexOf(lowerQuery, startIndex)

  while (index !== -1) {
    if (index > startIndex) {
      parts.push({ text: text.substring(startIndex, index), isMatch: false })
    }
    parts.push({ text: text.substring(index, index + query.length), isMatch: true })
    startIndex = index + query.length
    index = lowerText.indexOf(lowerQuery, startIndex)
  }

  if (startIndex < text.length) {
    parts.push({ text: text.substring(startIndex), isMatch: false })
  }

  return (
    <>
      {parts.map((part, i) =>
        part.isMatch ? (
          <mark
            key={i}
            className={cn(
              "bg-amber-200/40 text-foreground rounded-[2px] px-0.5",
              isActive && "ring-1 ring-primary/50"
            )}
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}
