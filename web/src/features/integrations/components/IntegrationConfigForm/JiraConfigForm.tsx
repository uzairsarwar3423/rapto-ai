"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { SearchableChannelPicker } from "../SearchableChannelPicker";
import { InlineFieldHint } from "@/shared/components/feedback/InlineFieldHint";
import { Label } from "@/components/ui/label";

const jiraSchema = z.object({
  projectKey: z.string().min(1, "Jira project is required"),
});

type JiraSchema = z.infer<typeof jiraSchema>;

interface JiraConfigFormProps {
  initialValue?: string;
  options: { id: string; name: string }[];
  isLoading: boolean;
  onSubmit: (values: { projectKey: string }) => void;
}

export function JiraConfigForm({
  initialValue = "",
  options,
  isLoading,
  onSubmit,
}: JiraConfigFormProps) {
  const { control, handleSubmit } = useForm<JiraSchema>({
    resolver: zodResolver(jiraSchema),
    defaultValues: {
      projectKey: initialValue,
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
          htmlFor="projectKey"
          className="text-xs font-sans font-medium text-foreground select-none"
        >
          Jira Project Key
        </Label>
        <Controller
          name="projectKey"
          control={control}
          render={({ field }) => (
            <SearchableChannelPicker
              options={options}
              value={field.value}
              onChange={field.onChange}
              placeholder={isLoading ? "Loading projects..." : "Select a project..."}
              searchPlaceholder="Search projects..."
              disabled={isLoading}
            />
          )}
        />
        <InlineFieldHint>
          Select which Jira project new issues and meeting commitments should be created under.
        </InlineFieldHint>
      </div>
    </form>
  );
}
