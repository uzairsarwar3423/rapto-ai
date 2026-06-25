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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDeferCommitment } from "../hooks/useDeferCommitment";
import type { Commitment } from "../types";

interface DeferSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitment: Commitment | null;
}

export function DeferSheet({ open, onOpenChange, commitment }: DeferSheetProps) {
  const [dateVal, setDateVal] = useState("");
  const [note, setNote] = useState("");

  // Get tomorrow's date string in local timezone format (YYYY-MM-DD)
  const getTomorrowString = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  useEffect(() => {
    if (open) {
      setDateVal(getTomorrowString());
      setNote("");
    }
  }, [open]);

  const deferMutation = useDeferCommitment(commitment?.id || "");

  // Simple client-side validation
  const isValid =
    dateVal &&
    new Date(`${dateVal}T23:59:59`).getTime() > Date.now();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitment || !isValid) return;

    // Convert local YYYY-MM-DD to ISO String at end of day local timezone
    const newDueDate = new Date(`${dateVal}T23:59:59`).toISOString();

    deferMutation.mutate({
      newDueDate,
      note: note.trim() || undefined,
    });

    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[320px] p-6 bg-white dark:bg-zinc-950 border-l border-border shadow-2xl font-sans flex flex-col h-full"
      >
        {commitment ? (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 h-full">
            <SheetHeader className="p-0 mb-6 shrink-0">
              <SheetTitle className="text-base font-semibold text-foreground font-heading">
                Defer commitment
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-1">
                Postpone the due date of this commitment. A valid future date is required.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 py-2 min-h-0 overflow-y-auto">
              {/* Native Date Input */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="defer-date-field"
                  className="text-xs font-medium text-foreground select-none"
                >
                  New Due Date
                </Label>
                <Input
                  id="defer-date-field"
                  type="date"
                  required
                  min={getTomorrowString()}
                  value={dateVal}
                  onChange={(e) => setDateVal(e.target.value)}
                  className="text-xs h-9 rounded-sm border-border bg-transparent text-foreground focus-visible:ring-1 focus-visible:ring-ring font-mono"
                />
              </div>

              {/* Optional note */}
              <div className="space-y-1.5 pt-2">
                <Label
                  htmlFor="defer-note-field"
                  className="text-xs font-medium text-foreground select-none"
                >
                  Reason / Note (Optional)
                </Label>
                <Textarea
                  id="defer-note-field"
                  placeholder="Explain why you are postponing this commitment..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="text-xs min-h-[90px] rounded-sm border-border bg-transparent text-foreground resize-none focus-visible:ring-1 focus-visible:ring-ring"
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
                  disabled={!isValid}
                  className="h-8 text-xs bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium cursor-pointer px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Defer
                </Button>
              </div>
            </SheetFooter>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
