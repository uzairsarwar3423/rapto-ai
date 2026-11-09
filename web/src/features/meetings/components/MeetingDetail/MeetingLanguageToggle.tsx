"use client";

import React, { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMeetingLanguageView } from "../../hooks/useMeetingLanguage";
import type { MeetingDisplayLanguage } from "../../types";

const OPTIONS: ReadonlyArray<{ value: MeetingDisplayLanguage; label: string }> = [
  { value: "original", label: "Original" },
  { value: "en", label: "English" },
];

function errorMessage(error: unknown): string {
  const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
  return msg || "Translation is unavailable right now. Showing the original.";
}

/**
 * Compact [ Original | English ] switch for generated meeting content.
 * Renders nothing for English meetings (or meetings with no generated content yet).
 * Selecting English translates once (server-cached); switching back is instant.
 */
export function MeetingLanguageToggle({ meetingId, className }: { meetingId: string; className?: string }) {
  const view = useMeetingLanguageView(meetingId);
  const { canTranslate, selected, setSelected, isTranslating, isError, error } = view;

  // One toast per failure: fall back to the original so the page is never blank or stuck.
  const reportedFor = useRef<unknown>(null);
  useEffect(() => {
    if (isError && reportedFor.current !== error) {
      reportedFor.current = error;
      toast.error(errorMessage(error));
      setSelected("original");
    }
  }, [isError, error, setSelected]);

  if (!canTranslate) return null;

  return (
    <div
      role="group"
      aria-label="Content language"
      className={cn("inline-flex shrink-0 items-center rounded-lg bg-muted/70 p-0.5", className)}
    >
      {OPTIONS.map(({ value, label }) => {
        const active = selected === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            // Locked while a translation is generating: no duplicate requests from repeated clicks.
            disabled={isTranslating}
            onClick={() => !active && setSelected(value)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium leading-none transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-wait",
              active
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {value === "en" && isTranslating && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
