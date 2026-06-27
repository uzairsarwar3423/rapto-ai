"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { SearchableChannelPicker } from "../SearchableChannelPicker";
import { InlineFieldHint } from "@/shared/components/feedback/InlineFieldHint";
import { Label } from "@/components/ui/label";

const notionSchema = z.object({
  databaseId: z.string().min(1, "Notion database is required"),
});

type NotionSchema = z.infer<typeof notionSchema>;

interface NotionConfigFormProps {
  initialValue?: string;
  options: { id: string; name: string }[];
  isLoading: boolean;
  onSubmit: (values: { databaseId: string }) => void;
}

export function NotionConfigForm({
  initialValue = "",
  options,
  isLoading,
  onSubmit,
}: NotionConfigFormProps) {
  const { control, handleSubmit } = useForm<NotionSchema>({
    resolver: zodResolver(notionSchema),
    defaultValues: {
      databaseId: initialValue,
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
          htmlFor="databaseId"
          className="text-xs font-sans font-medium text-foreground select-none"
        >
          Notion Database
        </Label>
        <Controller
          name="databaseId"
          control={control}
          render={({ field }) => (
            <SearchableChannelPicker
              options={options}
              value={field.value}
              onChange={field.onChange}
              placeholder={isLoading ? "Loading databases..." : "Select a database..."}
              searchPlaceholder="Search databases..."
              disabled={isLoading}
            />
          )}
        />
        <InlineFieldHint>
          Specify the target Notion database for cataloging meeting transcripts.
        </InlineFieldHint>
      </div>
    </form>
  );
}
