"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { InlineFieldHint } from "@/shared/components/feedback/InlineFieldHint";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Video } from "lucide-react";

const calendarSchema = z.object({
  calendarId: z.string().min(1, "Calendar ID is required"),
  syncEnabled: z.boolean(),
});

type CalendarSchema = z.infer<typeof calendarSchema>;

interface GoogleCalendarConfigFormProps {
  initialCalendarId?: string;
  initialSyncEnabled?: boolean;
  isLoading: boolean;
  onSubmit: (values: { calendarId: string; syncEnabled: boolean }) => void;
  onOpenPreview: () => void;
}

export function GoogleCalendarConfigForm({
  initialCalendarId = "primary",
  initialSyncEnabled = true,
  isLoading,
  onSubmit,
  onOpenPreview,
}: GoogleCalendarConfigFormProps) {
  const { register, control, handleSubmit } = useForm<CalendarSchema>({
    resolver: zodResolver(calendarSchema),
    defaultValues: {
      calendarId: initialCalendarId,
      syncEnabled: initialSyncEnabled,
    },
  });

  return (
    <form
      id="integration-config-form"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 font-sans"
    >
      {/* Calendar ID Input */}
      <div className="space-y-2">
        <Label
          htmlFor="calendarId"
          className="text-xs font-sans font-medium text-foreground select-none"
        >
          Calendar ID
        </Label>
        <Input
          id="calendarId"
          placeholder="primary"
          disabled={isLoading}
          className="h-8 text-xs font-sans border-muted/30 focus-visible:ring-1 focus-visible:ring-ring"
          {...register("calendarId")}
        />
        <InlineFieldHint>
          Typically "primary" to monitor your main account calendar, or a specific calendar shared address.
        </InlineFieldHint>
      </div>

      {/* Auto-Join Toggle */}
      <div className="flex items-start justify-between gap-4 border-t border-muted/10 pt-4">
        <div className="space-y-1">
          <Label className="text-xs font-sans font-medium text-foreground select-none">
            Auto-Join Meetings
          </Label>
          <InlineFieldHint>
            Automatically register a transcription bot to join calls found on this calendar.
          </InlineFieldHint>
        </div>
        <Controller
          name="syncEnabled"
          control={control}
          render={({ field }) => (
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={isLoading}
            />
          )}
        />
      </div>

      {/* Preview Trigger Link */}
      <div className="border-t border-muted/10 pt-4">
        <button
          type="button"
          onClick={onOpenPreview}
          className="text-xs font-sans font-medium text-primary hover:underline flex items-center gap-1.5 focus:outline-none"
        >
          <Video className="w-3.5 h-3.5" />
          Preview upcoming meetings from this calendar
        </button>
      </div>
    </form>
  );
}
