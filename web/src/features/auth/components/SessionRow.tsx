"use client";

import React from 'react';
import { Session } from '../types/auth.types';
import { RevokeSessionButton } from './RevokeSessionButton';
import { Laptop, Smartphone, Calendar } from 'lucide-react';

interface SessionRowProps {
  session: Session;
}

function parseUserAgent(uaString: string | null) {
  if (!uaString) return { browser: 'Unknown Browser', os: 'Unknown OS', isMobile: false };
  
  let os = 'Unknown OS';
  let isMobile = false;
  if (uaString.includes('Windows')) os = 'Windows';
  else if (uaString.includes('Macintosh') || uaString.includes('Mac OS')) os = 'macOS';
  else if (uaString.includes('Linux')) os = 'Linux';
  else if (uaString.includes('Android')) { os = 'Android'; isMobile = true; }
  else if (uaString.includes('iPhone') || uaString.includes('iPad')) { os = 'iOS'; isMobile = true; }

  let browser = 'Unknown Browser';
  if (uaString.includes('Firefox')) browser = 'Firefox';
  else if (uaString.includes('Chrome')) browser = 'Chrome';
  else if (uaString.includes('Safari') && !uaString.includes('Chrome')) browser = 'Safari';
  else if (uaString.includes('Edge')) browser = 'Edge';

  return { browser, os, isMobile };
}

export function SessionRow({ session }: SessionRowProps) {
  const { browser, os, isMobile } = parseUserAgent(session.userAgent);
  
  const formattedDate = new Date(session.lastUsedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex items-center justify-between py-4 border-b border-border last:border-0 hover:bg-surface/10 transition-colors px-2 rounded-xl">
      <div className="flex items-start gap-3">
        {/* Device Icon */}
        <div className="mt-0.5 p-2 bg-surface-hover/50 text-muted rounded-lg shrink-0 border border-border">
          {isMobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
        </div>

        {/* Details */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {browser} on {os}
            </span>
            {session.isCurrent && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand/10 text-brand border border-brand/20 select-none">
                Active now
              </span>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono bg-surface-hover/30 px-1.5 py-0.2 rounded border border-border text-[10px]">
              {session.ipAddress || 'Unknown IP'}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" />
              Last active: {formattedDate}
            </span>
          </div>
        </div>
      </div>

      {/* Action: Revoke Button if not current session */}
      {!session.isCurrent && (
        <RevokeSessionButton sessionId={session.id} />
      )}
    </div>
  );
}
