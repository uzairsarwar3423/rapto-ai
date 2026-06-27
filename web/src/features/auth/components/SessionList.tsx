"use client";

import React from 'react';
import { useSessions } from '../hooks/useSessions';
import { SessionRow } from './SessionRow';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SessionList() {
  const { data: sessions, isLoading, isError, error, refetch } = useSessions();

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-4 border-b border-border animate-pulse">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 bg-surface-hover rounded-lg border border-border" />
              <div className="space-y-2">
                <div className="h-3 w-32 bg-surface-hover rounded" />
                <div className="h-2.5 w-48 bg-surface-hover rounded" />
              </div>
            </div>
            <div className="h-7 w-16 bg-surface-hover rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-error-subtle/20 border border-error/15 rounded-xl text-center gap-3">
        <AlertCircle className="h-6 w-6 text-error" />
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Failed to load active sessions</p>
          <p className="text-[11px] text-muted-foreground">{(error as any)?.response?.data?.error?.message || 'An unexpected error occurred.'}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="text-xs h-8 cursor-pointer rounded-lg px-3"
        >
          <RefreshCw className="h-3 w-3 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4">
        No active sessions detected.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border border border-border rounded-xl px-4 py-2 bg-surface/30">
      {sessions.map((session) => (
        <SessionRow key={session.id} session={session} />
      ))}
    </div>
  );
}
