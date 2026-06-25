"use client";

import React from "react";
import { useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { DuplicateUrlError } from "../DuplicateUrlError";
import { cn } from "@/lib/utils";

export function ScheduledAtField() {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  const dateError = errors.scheduledDate?.message as string | undefined;
  const timeError = errors.scheduledTime?.message as string | undefined;
  const errorMessage = dateError || timeError;

  return (
    <div className="flex flex-col gap-1.5 w-full font-sans">
      <Label htmlFor="scheduledDate" className="text-sm font-medium text-foreground">
        Scheduled Date & Time
      </Label>
      
      <div
        className={cn(
          "flex h-9 items-center rounded-md border text-xs transition-colors duration-120 bg-card",
          errorMessage ? "border-foreground" : "border-border"
        )}
      >
        <input
          id="scheduledDate"
          type="date"
          className="w-1/2 h-full bg-transparent px-3 outline-none border-r border-border/50 font-mono text-foreground cursor-pointer"
          {...register("scheduledDate")}
        />
        <input
          id="scheduledTime"
          type="time"
          className="w-1/2 h-full bg-transparent px-3 outline-none font-mono text-foreground cursor-pointer"
          {...register("scheduledTime")}
        />
      </div>
      
      {errorMessage && <DuplicateUrlError message={errorMessage} />}
    </div>
  );
}
