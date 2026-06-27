"use client";

import React from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import { Video, CalendarDays, Loader2, XCircle, Info } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarEventPreviewRow } from "./CalendarEventPreviewRow";

interface CalendarEventsPreviewSheetProps {
  open: boolean;
  onClose: () => void;
}

export function CalendarEventsPreviewSheet({
  open,
  onClose,
}: CalendarEventsPreviewSheetProps) {
  const { data: events = [], isLoading, error } = useCalendarEvents();

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] bg-white dark:bg-zinc-950 p-6 flex flex-col select-none rounded-xl">
        <DialogHeader className="pb-4">
          <DialogTitle className="font-heading font-semibold text-lg tracking-tight text-foreground flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            Calendar Preview
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 font-sans">
            Displaying upcoming events from your primary calendar scheduled for the next 7 days.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 select-none">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground mt-2 font-sans">
                Fetching upcoming meetings...
              </span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive select-none">
              <XCircle className="w-5 h-5 shrink-0" />
              <span className="text-xs font-sans font-medium">
                Failed to load calendar events. Please check your connection.
              </span>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-xl p-6 text-center select-none">
              <CalendarDays className="w-8 h-8 text-muted-foreground/60 mb-2" />
              <h4 className="text-xs font-semibold text-foreground">No Upcoming Meetings</h4>
              <p className="text-[10px] text-muted-foreground max-w-xs mt-1 leading-normal font-sans">
                We couldn't find any scheduled events on this calendar for the next 7 days.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[360px] pr-3">
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 text-blue-600/80 mb-2 select-none">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="text-[10px] font-sans leading-normal">
                    Vocaply automatically parses calendar summaries, locations, and descriptions to detect meeting links from supported platforms.
                  </span>
                </div>

                <div className="divide-y divide-muted/10 border-t border-b border-muted/10">
                  {events.map((event) => (
                    <CalendarEventPreviewRow key={event.id} event={event} />
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="-mx-6 -mb-6 mt-6 p-6 bg-white dark:bg-zinc-950 rounded-b-xl border-t-0 flex flex-row justify-end select-none">
          <Button variant="outline" size="sm" className="h-9 text-xs font-sans" onClick={onClose}>
            Close Preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
