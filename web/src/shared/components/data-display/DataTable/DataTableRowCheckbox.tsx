"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface DataTableRowCheckboxProps {
  checked: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  className?: string;
}

export function DataTableRowCheckbox({
  checked,
  onClick,
  ariaLabel = "Select row",
  className,
}: DataTableRowCheckboxProps) {
  return (
    <Checkbox
      checked={checked}
      onClick={onClick}
      onCheckedChange={() => {
        // We override this to let onClick handle the custom selection trigger,
        // which allows checking for e.shiftKey and calling e.stopPropagation() cleanly.
      }}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
