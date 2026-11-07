"use client";

import React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AddMeetingButtonProps {
  onClick?: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export function AddMeetingButton({
  onClick,
  label = "Add Meeting",
  className = "",
  disabled = false,
  id,
}: AddMeetingButtonProps) {
  return (
    <Button
      id={id}
      size="sm"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      aria-label={label}
      className={cn("text-xs font-semibold", className)}
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
      <span>{label}</span>
    </Button>
  );
}

export default AddMeetingButton;
