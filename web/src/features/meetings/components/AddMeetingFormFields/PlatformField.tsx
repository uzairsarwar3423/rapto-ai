"use client";

import React from "react";
import { useFormContext, Controller } from "react-hook-form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DuplicateUrlError } from "../DuplicateUrlError";
import { cn } from "@/lib/utils";

export function PlatformField() {
  const {
    control,
    formState: { errors },
  } = useFormContext();

  const errorMessage = errors.platform?.message as string | undefined;

  return (
    <div className="flex flex-col gap-1.5 w-full font-sans">
      <Label htmlFor="platform" className="text-sm font-medium text-foreground">
        Platform
      </Label>
      <Controller
        name="platform"
        control={control}
        render={({ field }) => (
          <Select onValueChange={field.onChange} value={field.value}>
            <SelectTrigger
              id="platform"
              className={cn(
                "h-9 text-xs border transition-colors duration-120 bg-card font-sans cursor-pointer",
                errorMessage ? "border-foreground" : "border-border"
              )}
            >
              <SelectValue placeholder="Select Platform" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-zinc-950 border border-border" position="popper">
              <SelectItem value="ZOOM" className="cursor-pointer">Zoom</SelectItem>
              <SelectItem value="GOOGLE_MEET" className="cursor-pointer">Google Meet</SelectItem>
              <SelectItem value="TEAMS" className="cursor-pointer">Microsoft Teams</SelectItem>
              <SelectItem value="WEBEX" className="cursor-pointer">Webex</SelectItem>
              <SelectItem value="MANUAL" className="cursor-pointer">Manual / Other Link</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
      {errorMessage && <DuplicateUrlError message={errorMessage} />}
    </div>
  );
}
