import React from 'react';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SaveState } from '../../hooks/useSaveState';

interface SaveStateIndicatorProps {
  state: SaveState;
}

export function SaveStateIndicator({ state }: SaveStateIndicatorProps) {
  if (state === 'idle') return null;

  const config = {
    saving: { icon: Loader2, spin: true, label: 'Saving…', className: 'text-muted-foreground' },
    saved: { icon: Check, spin: false, label: 'Saved', className: 'text-brand' }, // Using text-brand instead of text-primary to align with Vocaply style system
    error: { icon: AlertCircle, spin: false, label: "Couldn't save", className: 'text-error' }, // Using text-error instead of text-destructive to align with Vocaply style system
  }[state];

  const IconComponent = config.icon;

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1 text-[12px] font-sans transition-opacity duration-150',
        config.className
      )}
    >
      <IconComponent className={cn('size-3.5', config.spin && 'animate-spin')} />
      {config.label}
    </span>
  );
}
