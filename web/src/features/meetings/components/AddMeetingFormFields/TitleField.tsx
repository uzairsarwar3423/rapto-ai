"use client";

import React from "react";
import { useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DuplicateUrlError } from "../DuplicateUrlError";
import { cn } from "@/lib/utils";

export function TitleField() {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  const errorMessage = errors.title?.message as string | undefined;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <Label htmlFor="title" className="text-sm font-medium font-sans text-foreground">
        Meeting Title
      </Label>
      <Input
        id="title"
        autoFocus
        placeholder="Engineering Sync / Weekly Alignment"
        className={cn(
          "h-9 text-xs border transition-colors duration-120 font-sans",
          errorMessage ? "border-foreground" : "border-border"
        )}
        {...register("title")}
      />
      {errorMessage && <DuplicateUrlError message={errorMessage} />}
    </div>
  );
}
