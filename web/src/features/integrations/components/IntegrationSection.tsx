"use client";

import React, { ReactNode } from "react";

interface IntegrationSectionProps {
  label: string;
  children: ReactNode;
}

export function IntegrationSection({ label, children }: IntegrationSectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading font-semibold text-[13px] leading-[20px] uppercase tracking-[0.04em] text-muted-foreground/60 select-none">
        {label}
      </h2>
      <div className="divide-y divide-muted/10 border-t border-b border-muted/10">
        {children}
      </div>
    </section>
  );
}
