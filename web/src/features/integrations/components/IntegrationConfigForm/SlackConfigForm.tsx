"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { SearchableChannelPicker } from "../SearchableChannelPicker";
import { InlineFieldHint } from "@/shared/components/feedback/InlineFieldHint";
import { Label } from "@/components/ui/label";

const slackSchema = z.object({
  channelId: z.string().min(1, "Slack channel is required"),
});

type SlackSchema = z.infer<typeof slackSchema>;

interface SlackConfigFormProps {
  initialValue?: string;
  options: { id: string; name: string }[];
  isLoading: boolean;
  onSubmit: (values: { channelId: string }) => void;
}

export function SlackConfigForm({
  initialValue = "",
  options,
  isLoading,
  onSubmit,
}: SlackConfigFormProps) {
  const { control, handleSubmit } = useForm<SlackSchema>({
    resolver: zodResolver(slackSchema),
    defaultValues: {
      channelId: initialValue,
    },
  });

  return (
    <form
      id="integration-config-form"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 font-sans"
    >
      <div className="space-y-2">
        <Label
          htmlFor="channelId"
          className="text-xs font-sans font-medium text-foreground select-none"
        >
          Post to Slack Channel
        </Label>
        <Controller
          name="channelId"
          control={control}
          render={({ field }) => (
            <SearchableChannelPicker
              options={options}
              value={field.value}
              onChange={field.onChange}
              placeholder={isLoading ? "Loading channels..." : "Select a channel..."}
              searchPlaceholder="Search channels..."
              disabled={isLoading}
            />
          )}
        />
        <InlineFieldHint>
          Choose the Slack channel where Vocaply will broadcast summaries and key action items automatically.
        </InlineFieldHint>
      </div>
    </form>
  );
}
