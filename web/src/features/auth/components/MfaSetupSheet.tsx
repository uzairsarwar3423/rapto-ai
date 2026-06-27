"use client";

import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface MfaSetupSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MfaSetupSheet({ open, onOpenChange }: MfaSetupSheetProps) {
  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) {
      setSubmitted(true);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[360px] p-6 bg-white dark:bg-zinc-950 border-l border-border shadow-2xl font-sans flex flex-col h-full"
      >
        <form onSubmit={handleVerify} className="flex flex-col flex-1 h-full">
          <SheetHeader className="p-0 mb-6 shrink-0">
            <SheetTitle className="text-base font-semibold text-foreground font-heading">
              Set up two-factor authentication (MFA)
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              Secure your account using a mobile authenticator app (like Google Authenticator or 1Password).
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 py-2 min-h-0 overflow-y-auto">
            {/* QR Code Placeholder */}
            <div className="flex flex-col items-center gap-3 bg-surface-2 p-4 rounded-xl border border-border">
              <div className="size-40 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-xs text-muted-foreground font-sans select-none bg-background">
                QR code placeholder
              </div>
              <div className="text-center space-y-0.5">
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                  Manual Entry Key
                </span>
                <span className="text-xs text-foreground font-mono select-all bg-background px-2 py-0.5 rounded border border-border">
                  ABCD-EFGH-IJKL-MNOP
                </span>
              </div>
            </div>

            {/* Validation input */}
            <div className="space-y-1.5">
              <Label
                htmlFor="mfa-verify-code"
                className="text-xs font-medium text-foreground select-none"
              >
                Enter 6-digit code
              </Label>
              <Input
                id="mfa-verify-code"
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="text-sm h-10 rounded-xl border-border bg-transparent text-foreground focus-visible:ring-1 focus-visible:ring-ring font-mono text-center tracking-[0.2em] text-lg"
              />
            </div>

            {/* Coming Soon Notice */}
            {submitted && (
              <p role="status" className="text-xs text-muted-foreground leading-normal mt-2 animate-in fade-in-0 duration-150">
                MFA verification is coming soon — this won't be enabled yet.
              </p>
            )}
          </div>

          <SheetFooter className="sticky bottom-0 bg-white dark:bg-zinc-950 border-t border-border pt-4 mt-6 flex flex-row items-center justify-between gap-2 shrink-0">
            <div className="text-3xs text-muted-foreground font-mono select-none">
              Esc to cancel
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-xs cursor-pointer px-3 rounded-xl"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={code.length !== 6}
                className="h-9 text-xs bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium cursor-pointer px-4 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
              >
                Verify and enable
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
