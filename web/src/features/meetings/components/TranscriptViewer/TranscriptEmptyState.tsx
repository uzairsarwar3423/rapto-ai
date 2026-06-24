import React from "react"
import { Loader2, AlertCircle } from "lucide-react"

interface TranscriptEmptyStateProps {
  status?: string
  onRetry?: () => void
}

export function TranscriptEmptyState({ status = "PROCESSING", onRetry }: TranscriptEmptyStateProps) {
  const isFailed = status === "FAILED"

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4 min-h-[400px]">
      {isFailed ? (
        <AlertCircle className="w-10 h-10 text-destructive opacity-80" />
      ) : (
        <Loader2 className="w-10 h-10 text-muted-foreground animate-spin opacity-50" />
      )}
      
      <div className="space-y-1">
        <h3 className="font-display text-[18px] font-semibold text-foreground">
          {isFailed ? "Transcript Processing Failed" : "Transcript will appear once processing completes"}
        </h3>
        <p className="font-sans text-[14px] text-muted-foreground max-w-md mx-auto">
          {isFailed 
            ? "We encountered an issue while generating the transcript for this meeting."
            : "This might take a few minutes depending on the meeting length."}
        </p>
      </div>

      {isFailed && onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors cursor-pointer"
        >
          Retry Processing
        </button>
      )}
    </div>
  )
}
