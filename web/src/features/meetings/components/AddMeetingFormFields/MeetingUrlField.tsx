"use client";

import React, { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DuplicateUrlError } from "../DuplicateUrlError";
import { PlatformDetectBadge } from "../PlatformDetectBadge";
import { usePlatformDetect } from "../../hooks/usePlatformDetect";
import { cn } from "@/lib/utils";

export function MeetingUrlField() {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext();

  const meetingUrlValue = watch("meetingUrl") || "";
  const errorMessage = errors.meetingUrl?.message as string | undefined;

  const { platform, isDetecting } = usePlatformDetect(meetingUrlValue);

  // Auto-set the platform field value when a platform is detected
  useEffect(() => {
    if (platform) {
      setValue("platform", platform, { shouldValidate: true, shouldDirty: true });
    }
  }, [platform, setValue]);

  return (
    <div className="flex flex-col gap-1.5 w-full font-sans">
      <div className="flex items-center justify-between min-h-6">
        <Label htmlFor="meetingUrl" className="text-sm font-medium text-foreground">
          Meeting Link / URL
        </Label>
        <PlatformDetectBadge platform={platform} isDetecting={isDetecting} />
      </div>
      <div className="relative flex items-center">
        <Input
          id="meetingUrl"
          placeholder="https://zoom.us/j/123456789"
          className={cn(
            "h-9 text-xs border transition-colors duration-120 font-sans w-full pr-8",
            errorMessage ? "border-foreground" : "border-border"
          )}
          {...register("meetingUrl")}
        />
        {/* Pulsing indicator dot on the right side of the input during detection */}
        {isDetecting && (
          <div className="absolute right-3 flex h-2 w-2 items-center justify-center">
            <span
              className="h-1.5 w-1.5 rounded-full bg-foreground/60"
              style={{
                animation: "pulse 600ms cubic-bezier(0.4, 0, 0.6, 1) infinite",
              }}
            />
          </div>
        )}
      </div>
      {errorMessage && <DuplicateUrlError message={errorMessage} />}
    </div>
  );
}
