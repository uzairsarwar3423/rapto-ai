"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';

interface SettingsPlaceholderProps {
  title: string;
  description: string;
  comingDay: number;
}

export function SettingsPlaceholder({ title, description, comingDay }: SettingsPlaceholderProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-lg font-bold text-foreground">
          {title}
        </h1>
        <p className="font-sans text-xs text-muted-foreground mt-1">
          {description}
        </p>
      </div>

      <div className="flex flex-col items-center justify-center p-12 border border-border rounded-xl bg-surface/30 text-center max-w-xl animate-in fade-in-0 duration-120">
        <Badge variant="outline" className="mb-3 text-[10px] px-2 py-0.5 normal-case font-normal select-none">
          Coming Day {comingDay}
        </Badge>
        <h3 className="text-sm font-semibold text-foreground">
          {title} settings are currently locked
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
          We are polishing the {title.toLowerCase()} system for you. Check back on Day {comingDay} when this feature is fully built and enabled!
        </p>
      </div>
    </div>
  );
}
