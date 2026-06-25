"use client";

import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCancelCommitment } from "../hooks/useCancelCommitment";
import type { Commitment } from "../types";

interface CancelCommitmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitment: Commitment | null;
}

export function CancelCommitmentSheet({
  open,
  onOpenChange,
  commitment,
}: CancelCommitmentSheetProps) {
  const [note, setNote] = useState("");
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setNote("");
    }
  }, [open]);

  const cancelMutation = useCancelCommitment(commitment?.id || "");

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitment || !note.trim()) return;

    // Close the sheet first
    onOpenChange(false);

    // Open the alert dialog after a deliberate 60ms gap to prevent overlapping animation conflicts
    setTimeout(() => {
      setIsAlertOpen(true);
    }, 60);
  };

  const handleFinalCancel = () => {
    if (!commitment) return;
    cancelMutation.mutate({ note: note.trim() });
    setIsAlertOpen(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[320px] p-6 bg-white dark:bg-zinc-950 border-l border-border shadow-2xl font-sans flex flex-col h-full"
        >
          {commitment ? (
            <form onSubmit={handleContinue} className="flex flex-col flex-1 h-full">
              <SheetHeader className="p-0 mb-6 shrink-0">
                <SheetTitle className="text-base font-semibold text-foreground font-heading">
                  Cancel commitment
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground mt-1">
                  Marking a commitment as cancelled requires an explanatory note.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-4 py-2 min-h-0 overflow-y-auto">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="cancel-reason-field"
                    className="text-xs font-medium text-foreground select-none"
                  >
                    Cancellation Note
                  </Label>
                  <Textarea
                    id="cancel-reason-field"
                    required
                    autoFocus
                    placeholder="Explain why this commitment is no longer valid or necessary..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="text-xs min-h-[120px] rounded-sm border-border bg-transparent text-foreground resize-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    disabled={!note.trim()}
                    className="h-8 text-xs bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium cursor-pointer px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </Button>
                </div>
              </SheetFooter>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Step 2 Confirmation Alert Dialog */}
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent className="max-w-[400px] font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold text-foreground">
              Cancel this commitment?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground space-y-2 mt-1">
              <p>Are you sure you want to cancel this commitment? This action is final.</p>
              <div className="mt-2 border-l-2 border-border pl-3.5 py-1 italic text-foreground text-xs bg-muted/20 rounded-r-xs">
                &ldquo;{note.trim()}&rdquo;
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="gap-2 sm:gap-0 mt-4">
            {/* Safe default action is autoFocused */}
            <AlertDialogCancel
              autoFocus
              className="h-8 text-xs cursor-pointer px-3 rounded-sm border border-border"
            >
              Keep commitment
            </AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              onClick={handleFinalCancel}
              className="h-8 text-xs cursor-pointer px-3 rounded-sm font-medium bg-red-600 hover:bg-red-700 text-white border-none"
            >
              Cancel commitment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
