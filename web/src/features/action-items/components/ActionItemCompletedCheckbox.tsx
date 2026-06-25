"use client";

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface ActionItemCompletedCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel?: string;
  className?: string;
}

export function ActionItemCompletedCheckbox({
  checked,
  onCheckedChange,
  ariaLabel,
  className,
}: ActionItemCompletedCheckboxProps) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(val) => onCheckedChange(!!val)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.stopPropagation();
        }
      }}
      aria-label={ariaLabel}
      className={className}
    />
  );
}
