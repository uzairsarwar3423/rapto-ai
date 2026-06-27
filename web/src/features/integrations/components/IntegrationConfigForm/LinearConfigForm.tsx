"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { SearchableChannelPicker } from "../SearchableChannelPicker";
import { InlineFieldHint } from "@/shared/components/feedback/InlineFieldHint";
import { Label } from "@/components/ui/label";

const linearSchema = z.object({
  linearTeamId: z.string().min(1, "Linear team is required"),
});

type LinearSchema = z.infer<typeof linearSchema>;

interface LinearConfigFormProps {
  initialValue?: string;
  options: { id: string; name: string }[];
  isLoading: boolean;
  onSubmit: (values: { linearTeamId: string }) => void;
}

export function LinearConfigForm({
  initialValue = "",
  options,
  isLoading,
  onSubmit,
}: LinearConfigFormProps) {
  const { control, handleSubmit } = useForm<LinearSchema>({
    resolver: zodResolver(linearSchema),
    defaultValues: {
      linearTeamId: initialValue,
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
          htmlFor="linearTeamId"
          className="text-xs font-sans font-medium text-foreground select-none"
        >
          Linear Team
        </Label>
        <Controller
          name="linearTeamId"
          control={control}
          render={({ field }) => (
            <SearchableChannelPicker
              options={options}
              value={field.value}
              onChange={field.onChange}
              placeholder={isLoading ? "Loading teams..." : "Select a team..."}
              searchPlaceholder="Search teams..."
              disabled={isLoading}
            />
          )}
        />
        <InlineFieldHint>
          Select which team's board your meeting action items should sync to.
        </InlineFieldHint>
      </div>
    </form>
  );
}
