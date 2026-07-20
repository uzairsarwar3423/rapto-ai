"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SlackChannelPicker } from "./SlackChannelPicker";
import { useConfigureSlack } from "../hooks/useConfigureSlack";
import { Loader2, AlertCircle } from "lucide-react";

interface SlackConfigFormProps {
  initialChannelId?: string;
  initialChannelName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function SlackConfigForm({
  initialChannelId = "",
  initialChannelName = "",
  onSuccess,
  onCancel,
}: SlackConfigFormProps) {
  const [channelId, setChannelId] = useState(initialChannelId);
  const [channelName, setChannelName] = useState(initialChannelName);
  const [formError, setFormError] = useState<string | null>(null);

  const { mutateAsync: configure, isPending: isConfiguring, error: configError } = useConfigureSlack();

  useEffect(() => {
    if (initialChannelId) setChannelId(initialChannelId);
    if (initialChannelName) setChannelName(initialChannelName);
  }, [initialChannelId, initialChannelName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!channelId) {
      setFormError("Please select a default channel.");
      return;
    }

    try {
      await configure({
        defaultChannelId: channelId,
        defaultChannelName: channelName,
      });
      onSuccess?.();
    } catch (err) {
      // Error handled by hook
    }
  };

  const displayError = formError || (configError as any)?.message;

  return (
    <form id="slack-config-form" onSubmit={handleSubmit} className="space-y-6 pt-4">
      <div className="space-y-2">
        <Label htmlFor="slack-channel-picker" className="text-sm font-medium text-foreground">
          Default Channel
        </Label>
        <SlackChannelPicker
          value={channelId}
          onChange={(val, name) => {
            setChannelId(val);
            setChannelName(name);
          }}
          disabled={isConfiguring}
        />
        <p className="text-xs text-muted-foreground mt-2">
          Meeting summaries and alerts will be posted in this channel.
        </p>
      </div>

      {displayError && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive leading-relaxed">{displayError}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isConfiguring}
            className="h-9 text-xs font-sans"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={isConfiguring || !channelId}
          className="h-9 text-xs font-sans min-w-[100px]"
        >
          {isConfiguring ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving…
            </span>
          ) : (
            "Save Configuration"
          )}
        </Button>
      </div>
    </form>
  );
}
