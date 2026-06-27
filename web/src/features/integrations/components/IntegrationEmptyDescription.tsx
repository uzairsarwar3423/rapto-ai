"use client";

import React from "react";

interface IntegrationEmptyDescriptionProps {
  provider: string;
}

export function IntegrationEmptyDescription({ provider }: IntegrationEmptyDescriptionProps) {
  const providerLabel = provider.charAt(0) + provider.slice(1).toLowerCase();
  return (
    <p className="text-[13px] font-sans font-normal text-muted-foreground/60 leading-[20px] select-none">
      No destination configured for {providerLabel}. Click configure below to select your sync path.
    </p>
  );
}
