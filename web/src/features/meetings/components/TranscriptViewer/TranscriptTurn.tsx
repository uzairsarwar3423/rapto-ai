import React, { memo } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { TranscriptSearchHighlight } from "./TranscriptSearchHighlight"

interface TranscriptTurnProps {
  turn: {
    id: string
    speaker: string
    speakerId?: string
    confidence?: number
    text: string
    start_time: number
    end_time: number
  }
  isHighlighted?: boolean
  isActiveMatch?: boolean
  searchQuery?: string
  onCopy?: (text: string) => void
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

function TranscriptTurnComponent({
  turn,
  isHighlighted,
  isActiveMatch,
  searchQuery,
  onCopy,
}: TranscriptTurnProps) {
  const isUnresolved = turn.confidence !== undefined && turn.confidence < 0.8
  const displayName = isUnresolved ? "External participant" : turn.speaker

  return (
    <div className="group flex gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
      <Avatar className={cn("h-6 w-6 mt-0.5", isUnresolved && "border border-dashed border-muted-foreground/50 bg-transparent")}>
        <AvatarFallback className={cn("text-[10px]", isUnresolved && "bg-transparent text-muted-foreground")}>
          {isUnresolved ? "?" : displayName.substring(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className={cn("text-[13px] font-semibold truncate", isUnresolved ? "text-muted-foreground font-medium" : "text-foreground")}>
              {displayName}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums shrink-0">
              {formatTime(turn.start_time)}
            </span>
          </div>
          
          <button 
            onClick={() => onCopy?.(turn.text)}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
            aria-label="Copy turn"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
        
        <p className="text-[14px] text-foreground/90 leading-[1.6]">
          {searchQuery && isHighlighted ? (
            <TranscriptSearchHighlight text={turn.text} query={searchQuery} isActive={isActiveMatch} />
          ) : (
            turn.text
          )}
        </p>
      </div>
    </div>
  )
}

export const TranscriptTurn = memo(TranscriptTurnComponent, (prev, next) => {
  return (
    prev.turn.id === next.turn.id &&
    prev.isHighlighted === next.isHighlighted &&
    prev.isActiveMatch === next.isActiveMatch &&
    prev.searchQuery === next.searchQuery
  )
})
