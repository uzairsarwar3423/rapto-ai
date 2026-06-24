"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlatformType } from "../types";

interface AddMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMeetingModal({ open, onOpenChange }: AddMeetingModalProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    title: "",
    platform: "MANUAL" as PlatformType,
    meetingUrl: "",
    scheduledDate: "",
    scheduledTime: "",
  });

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!formData.title.trim()) nextErrors.title = "Title is required";
    if (!formData.meetingUrl.trim()) {
      nextErrors.meetingUrl = "Meeting URL is required";
    } else {
      try {
        new URL(formData.meetingUrl);
      } catch {
        nextErrors.meetingUrl = "Provide a valid URL";
      }
    }
    if (!formData.scheduledDate) nextErrors.scheduledDate = "Date is required";
    if (!formData.scheduledTime) nextErrors.scheduledTime = "Time is required";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const scheduledAt = new Date(
        `${formData.scheduledDate}T${formData.scheduledTime}`
      ).toISOString();

      await api.post("/meetings", {
        title: formData.title,
        platform: formData.platform,
        meetingUrl: formData.meetingUrl,
        scheduledAt,
      });

      toast.success("Meeting scheduled successfully");
      
      // Invalidate queries to refresh list
      queryClient.invalidateQueries({ queryKey: ["meetings", "list"] });
      
      // Reset form
      setFormData({
        title: "",
        platform: "MANUAL",
        meetingUrl: "",
        scheduledDate: "",
        scheduledTime: "",
      });

      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      const backendMessage = err?.response?.data?.message || "Failed to schedule meeting";
      const fieldErrors = err?.response?.data?.errors || {};
      
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
      } else {
        toast.error(backendMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md p-6 bg-white dark:bg-zinc-950 border border-border shadow-2xl font-sans rounded-xl">
        <DialogHeader className="p-0 mb-4">
          <DialogTitle className="text-base font-semibold text-foreground">
            Schedule a Meeting
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Fill in the details to schedule a new meeting manually. Recall.ai will automatically join 2 minutes prior to start.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Title Field */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title" className="text-xs font-medium text-foreground">
              Meeting Title
            </Label>
            <Input
              id="title"
              placeholder="Engineering Sync / Weekly Alignment"
              value={formData.title}
              onChange={(e) => handleChange("title", e.target.value)}
              className="h-9 text-xs border border-border"
              disabled={loading}
            />
            {errors.title && (
              <span className="text-2xs text-red-500">{errors.title}</span>
            )}
          </div>

          {/* Platform Select */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="platform" className="text-xs font-medium text-foreground">
              Platform
            </Label>
            <Select
              value={formData.platform}
              onValueChange={(val) => handleChange("platform", val)}
              disabled={loading}
            >
              <SelectTrigger id="platform" className="h-9 text-xs border border-border bg-card">
                <SelectValue placeholder="Select Platform" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-zinc-950 border border-border" position="popper">
                <SelectItem value="ZOOM">Zoom</SelectItem>
                <SelectItem value="GOOGLE_MEET">Google Meet</SelectItem>
                <SelectItem value="TEAMS">Microsoft Teams</SelectItem>
                <SelectItem value="WEBEX">Webex</SelectItem>
                <SelectItem value="MANUAL">Manual / Other Link</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Meeting URL */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meetingUrl" className="text-xs font-medium text-foreground">
              Meeting Link / URL
            </Label>
            <Input
              id="meetingUrl"
              placeholder="https://zoom.us/j/123456789"
              value={formData.meetingUrl}
              onChange={(e) => handleChange("meetingUrl", e.target.value)}
              className="h-9 text-xs border border-border"
              disabled={loading}
            />
            {errors.meetingUrl && (
              <span className="text-2xs text-red-500">{errors.meetingUrl}</span>
            )}
          </div>

          {/* Scheduled Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scheduledDate" className="text-xs font-medium text-foreground">
                Date
              </Label>
              <Input
                id="scheduledDate"
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => handleChange("scheduledDate", e.target.value)}
                className="h-9 text-xs border border-border"
                disabled={loading}
              />
              {errors.scheduledDate && (
                <span className="text-2xs text-red-500">
                  {errors.scheduledDate}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scheduledTime" className="text-xs font-medium text-foreground">
                Time
              </Label>
              <Input
                id="scheduledTime"
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => handleChange("scheduledTime", e.target.value)}
                className="h-9 text-xs border border-border"
                disabled={loading}
              />
              {errors.scheduledTime && (
                <span className="text-2xs text-red-500">
                  {errors.scheduledTime}
                </span>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-row items-center justify-end gap-3 bg-white dark:bg-zinc-950">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="h-9 text-xs bg-white dark:bg-zinc-900"
                disabled={loading}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="h-9 text-xs bg-brand hover:bg-brand/90 text-white font-medium"
              disabled={loading}
            >
              {loading ? "Scheduling..." : "Schedule Meeting"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
