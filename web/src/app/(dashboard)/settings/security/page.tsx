"use client";

import React, { useState } from 'react';
import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm';
import { SessionList } from '@/features/auth/components/SessionList';
import { MfaSetupSheet } from '@/features/auth/components/MfaSetupSheet';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SecuritySettingsPage() {
  const [mfaOpen, setMfaOpen] = useState(false);

  return (
    <div className="space-y-8 pb-10">
      {/* Page Header */}
      <div>
        <h1 className="font-heading text-lg font-bold text-foreground">
          Security Settings
        </h1>
        <p className="font-sans text-xs text-muted-foreground mt-1">
          Manage your account credentials, configure two-factor authentication, and track active sessions.
        </p>
      </div>

      {/* Change Password Section */}
      <div className="space-y-4 border-b border-border pb-6">
        <div>
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Change Password
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Ensure your account is using a long, random password to stay secure.
          </p>
        </div>
        <ChangePasswordForm />
      </div>

      {/* MFA Section */}
      <div className="space-y-4 border-b border-border pb-6">
        <div>
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Two-Factor Authentication
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Add an extra layer of security to your account by requiring a verification code at login.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-surface/30 max-w-2xl">
          <div className="flex gap-3">
            <div className="mt-0.5 p-2 bg-amber-500/10 text-amber-500 rounded-lg shrink-0 h-fit border border-amber-500/15">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-foreground">Two-factor authentication is disabled</p>
              <p className="text-xs text-muted-foreground">Protect your account from unauthorized access by setting up TOTP MFA.</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMfaOpen(true)}
            className="text-xs h-9 cursor-pointer px-4 rounded-xl shrink-0 self-start sm:self-center"
          >
            Configure MFA
          </Button>
        </div>

        <MfaSetupSheet open={mfaOpen} onOpenChange={setMfaOpen} />
      </div>

      {/* Active Sessions Section */}
      <div className="space-y-4 max-w-3xl">
        <div>
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Active Sessions
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            These are the devices that have recently logged into your account. Revoke any sessions you do not recognize.
          </p>
        </div>
        <SessionList />
      </div>
    </div>
  );
}
