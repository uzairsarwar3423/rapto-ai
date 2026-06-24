"use client";

import React, { useState } from "react";
import { useOnboarding } from "@/features/onboarding/hooks/useOnboarding";
import { ShieldAlert, Plus, Trash2, Loader2, Mail, ChevronDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Link from "next/link";

const ROLES = [
  { value: "MEMBER",  label: "Member",  desc: "Can view and comment" },
  { value: "MANAGER", label: "Manager", desc: "Can manage members" },
  { value: "ADMIN",   label: "Admin",   desc: "Full workspace access" },
] as const;

type RoleValue = typeof ROLES[number]["value"];

export default function InviteTeamPage() {
  const { inviteMembers, isInviting } = useOnboarding();
  const [emails, setEmails] = useState<string[]>([""]);
  const [error, setError] = useState("");
  const [role, setRole] = useState<RoleValue>("MEMBER");
  const [roleOpen, setRoleOpen] = useState(false);
  const selectedRole = ROLES.find((r) => r.value === role)!

  const handleEmailChange = (index: number, value: string) => {
    const updated = [...emails];
    updated[index] = value.trim();
    setEmails(updated);
  };

  const addEmailRow = () => {
    if (emails.length >= 10) return; // limit to 10 on onboarding form
    setEmails([...emails, ""]);
  };

  const removeEmailRow = (index: number) => {
    if (emails.length === 1) {
      setEmails([""]);
      return;
    }
    const updated = emails.filter((_, i) => i !== index);
    setEmails(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Filter out empty rows
    const validEmails = emails.filter(Boolean);

    if (validEmails.length === 0) {
      setError("Please enter at least one email or click Skip");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of validEmails) {
      if (!emailRegex.test(email)) {
        setError(`"${email}" is not a valid email address`);
        return;
      }
    }

    inviteMembers({ emails: validEmails, role });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="space-y-2 text-center md:text-left">
        <div className="mx-auto md:mx-0 h-10 w-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center mb-2">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <h1 className="text-2xl onboarding-heading font-bold text-foreground">
          Invite your teammates
        </h1>
        <p className="text-sm text-muted">
          Add coworkers to your team. They'll receive an email invite to join your workspace and track commitments together.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3.5 rounded-xl bg-error-subtle border border-error/20 text-xs text-error flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
          {emails.map((email, index) => (
            <div key={index} className="flex items-center gap-2.5 animate-in fade-in slide-in-from-left-2 duration-150">
              <div className="relative flex-1">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted/60 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(index, e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-surface-2/45 text-sm text-foreground focus:outline-none focus:border-brand transition"
                />
              </div>
              
              <button
                type="button"
                onClick={() => removeEmailRow(index)}
                className="h-10 w-10 rounded-xl border border-border flex items-center justify-center text-muted hover:text-error hover:border-error/20 hover:bg-error-subtle/10 transition duration-150 focus:outline-none cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addEmailRow}
          disabled={emails.length >= 10}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-border rounded-xl text-xs font-semibold text-muted hover:text-brand hover:border-brand/40 hover:bg-brand/5 transition duration-150 focus:outline-none cursor-pointer disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Another Invitee</span>
        </button>

        <div className="flex flex-col gap-3 pt-2">
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-surface-2/45">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-foreground">Assign Role</p>
              <p className="text-xs text-muted">Role applies to all invited members</p>
            </div>
            <Popover open={roleOpen} onOpenChange={setRoleOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-white text-sm font-medium text-foreground hover:bg-surface-hover transition cursor-pointer focus:outline-none focus:border-brand"
                >
                  <span>{selectedRole.label}</span>
                  <ChevronDown className={`h-3.5 w-3.5 text-muted transition-transform duration-150 ${roleOpen ? "rotate-180" : ""}`} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={6}
                className="w-48 p-1 rounded-xl border border-border bg-white shadow-lg z-[200]"
              >
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => { setRole(r.value); setRoleOpen(false); }}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition cursor-pointer hover:bg-surface-hover ${
                      role === r.value ? "bg-brand/5" : ""
                    }`}
                  >
                    <div className="flex-1">
                      <p className={`text-sm font-medium leading-none mb-0.5 ${
                        role === r.value ? "text-brand" : "text-foreground"
                      }`}>{r.label}</p>
                      <p className="text-[11px] text-muted leading-none">{r.desc}</p>
                    </div>
                    {role === r.value && (
                      <Check className="h-3.5 w-3.5 text-brand mt-0.5 shrink-0" />
                    )}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          <button
            type="submit"
            disabled={isInviting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-brand-mid hover:shadow-brand active:scale-[0.98] disabled:opacity-50"
          >
            {isInviting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Sending Invitations...</span>
              </>
            ) : (
              <span>Send Invites & Continue</span>
            )}
          </button>

          <div className="flex items-center justify-between gap-3">
            <Link
              href="/onboarding/create-team"
              className="flex-1 py-3.5 text-center text-xs font-semibold text-muted hover:text-foreground hover:underline transition duration-150"
            >
              Back
            </Link>
            <Link
              href="/onboarding/connect-calendar"
              className="flex-1 py-3.5 text-center text-xs font-semibold text-muted hover:text-foreground hover:underline transition duration-150"
            >
              Skip for now
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
