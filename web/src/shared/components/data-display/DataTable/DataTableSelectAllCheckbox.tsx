"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataTableSelectAllCheckboxProps {
  state: "none" | "some" | "all";
  onClick: () => void;
}

export function DataTableSelectAllCheckbox({ state, onClick }: DataTableSelectAllCheckboxProps) {
  const checked = state === "all" ? true : state === "some" ? "indeterminate" : false;

  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={onClick}
      aria-label="Select all rows"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        "ml-3"
      )}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center text-current [&>svg]:size-3">
        {state === "some" ? (
          <Minus className="stroke-[3.5]" />
        ) : (
          <Check className="stroke-[3.5]" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
