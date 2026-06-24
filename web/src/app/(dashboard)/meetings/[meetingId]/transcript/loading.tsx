import React from "react"
import { Skeleton } from "@/components/ui/skeleton"

export default function TranscriptLoading() {
  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[450px] border border-border rounded-lg bg-background overflow-hidden">
      {/* Mirror Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-4 py-3 border-b border-border bg-background">
        <div className="flex-1 max-w-md w-full">
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 w-full md:w-auto">
          <Skeleton className="h-8 w-24 rounded-md" />
          <div className="hidden md:block w-px h-4 bg-border" />
          <Skeleton className="hidden md:block h-4 w-16" />
        </div>
      </div>

      {/* Mirror Virtualized Turns List */}
      <div className="flex-1 p-4 space-y-6 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-1">
            {/* Avatar Placeholder */}
            <Skeleton className="h-6 w-6 rounded-full shrink-0" />
            
            <div className="flex-1 space-y-2.5">
              {/* Speaker name + timestamp placeholders */}
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-3.5 w-12 rounded" />
              </div>
              
              {/* Turn body paragraph placeholders */}
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-[95%] rounded" />
                <Skeleton className="h-4 w-[75%] rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
