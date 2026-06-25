"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMarkFulfilled } from "../hooks/useMarkFulfilled";
import type { Commitment } from "../types";

interface MarkFulfilledSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitment: Commitment | null;
}

export function MarkFulfilledSheet({
  open,
  onOpenChange,
  commitment,
}: MarkFulfilledSheetProps) {
  const [note, setNote] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Clear state when sheet is opened/closed
  useEffect(() => {
    if (open) {
      setNote("");
    }
  }, [open]);

  // Hook to handle mutation
  const markFulfilledMutation = useMarkFulfilled(commitment?.id || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitment) return;

    // Fire mutation (which runs optimistically)
    markFulfilledMutation.mutate({ note: note.trim() || undefined });

    // Close immediately (0ms wait for server response) so sheet close
    // and row update animations play concurrently.
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    // Submit on Enter unless focus is inside the note textarea
    if (e.key === "Enter" && !e.shiftKey) {
      const target = e.target as HTMLElement;
      if (target.tagName !== "TEXTAREA") {
        e.preventDefault();
        handleSubmit(e);
      }
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[320px] p-6 bg-white dark:bg-zinc-950 border-l border-border shadow-2xl font-sans flex flex-col h-full"
      >
        {commitment ? (
          <form
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            className="flex flex-col flex-1 h-full"
          >
            <SheetHeader className="p-0 mb-6 shrink-0">
              <SheetTitle className="text-base font-semibold text-foreground font-heading">
                Mark as fulfilled
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-1">
                You are marking this commitment as completed. You can optionally add a note with details.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 py-2 min-h-0 overflow-y-auto">
              <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-foreground mb-4">
                <span className="font-semibold block text-2xs text-muted-foreground uppercase tracking-wider mb-1 select-none">
                  Commitment text
                </span>
                {commitment.text}
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="fulfilled-note"
                  className="text-xs font-medium text-foreground select-none"
                >
                  Notes / Outcome
                </Label>
                <Textarea
                  id="fulfilled-note"
                  ref={textareaRef}
                  autoFocus
                  placeholder="Summarize the outcome or add details (optional)..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="text-xs min-h-[100px] rounded-sm border-border bg-transparent text-foreground resize-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>

            <SheetFooter className="sticky bottom-0 bg-white dark:bg-zinc-950 border-t border-border pt-4 mt-6 flex flex-row items-center justify-between gap-2 shrink-0">
              <div className="text-3xs text-muted-foreground font-mono select-none">
                Esc to cancel
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs cursor-pointer px-3"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 text-xs bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium cursor-pointer px-4"
                >
                  Mark fulfilled
                </Button>
              </div>
            </SheetFooter>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
