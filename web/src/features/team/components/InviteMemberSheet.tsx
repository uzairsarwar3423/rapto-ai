// web/src/features/team/components/InviteMemberSheet.tsx

"use client";

import React, { useState } from "react";
import { Check, Minus, Clock, X, Crown, ArrowRight, UserPlus, User as UserIcon, Shield as ShieldIcon, Copy as CopyIcon } from "lucide-react";
import { useInviteMembers } from "../hooks/useInviteMembers";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { InviteResult, UserRole } from "../types/team.types";

interface InviteMemberSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteMemberSheet({ open, onOpenChange }: InviteMemberSheetProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [role, setRole] = useState<UserRole>("MEMBER");
  const [result, setResult] = useState<InviteResult | null>(null);

  const inviteMutation = useInviteMembers();

  const handleInvite = () => {
    if (emails.length === 0) return;
    inviteMutation.mutate(
      { emails, role },
      {
        onSuccess: (data) => {
          setResult(data);
        },
      }
    );
  };

  const handleReset = () => {
    setResult(null);
    setEmails([]);
    inviteMutation.reset();
  };

  const isLimitError =
    inviteMutation.error?.response?.data?.error?.code === "PLAN_LIMIT_REACHED" ||
    inviteMutation.error?.response?.data?.error?.code === "PLAN_LIMIT" ||
    inviteMutation.error?.code === "PLAN_LIMIT";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md flex flex-col h-full bg-white dark:bg-zinc-950">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="font-plus-jakarta font-semibold text-[15px] flex items-center gap-2">
            <UserPlus className="size-4 text-brand" />
            Invite teammates
          </SheetTitle>
          <SheetDescription className="text-xs">
            Send email invitations to bring new collaborators into your workspace.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 px-6 py-5 overflow-y-auto flex flex-col gap-5">
          {/* Plan Limit Banner */}
          {isLimitError && (
            <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-rose-500/10 p-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-inner">
                  <Crown className="h-4.5 w-4.5 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold tracking-tight text-foreground">
                    Teammate Limit Reached
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    You have hit the member capacity limits of your current plan. Upgrade to invite more teammates.
                  </span>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] bg-white hover:bg-amber-50/50 border-amber-500/30 text-amber-700 hover:text-amber-800 font-semibold px-3 py-1 rounded-md transition-all duration-200"
                  onClick={() => {
                    const upgradeUrl = inviteMutation.error?.response?.data?.error?.details?.upgradeUrl || "/pricing";
                    window.location.href = upgradeUrl;
                  }}
                >
                  Upgrade Plan
                </Button>
              </div>
            </div>
          )}

          {!result ? (
            <>
              {/* Email tags block */}
              <EmailChipInput value={emails} onChange={setEmails} max={20} />

              {/* Role Select Cards */}
              <RoleCardSelector value={role} onChange={setRole} />
            </>
          ) : (
            /* Results Panel */
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4"
            >
              {/* Success celebration banner */}
              <div className="flex flex-col items-center justify-center p-4 text-center rounded-xl bg-brand-subtle/20 border border-brand/10">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-brand mb-2 animate-bounce">
                  <Check className="size-5 stroke-[3px]" />
                </div>
                <h3 className="text-sm font-semibold text-brand">Invitations Processed</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[240px]">
                  Your teammates will receive an email shortly to join the workspace.
                </p>
              </div>

              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-1.5 border-b border-border">
                Invitation Results
              </div>
              <ul className="divide-y divide-border border border-border rounded-lg bg-surface/30 px-3 py-1 overflow-hidden">
                {result.invited.map((email) => (
                  <InviteResultRow key={email} email={email} status="invited" />
                ))}
                {result.alreadyMember.map((email) => (
                  <InviteResultRow key={email} email={email} status="alreadyMember" />
                ))}
                {result.alreadyInvited.map((email) => (
                  <InviteResultRow key={email} email={email} status="alreadyInvited" />
                ))}
                {result.failed.map((email) => (
                  <InviteResultRow key={email} email={email} status="failed" />
                ))}
              </ul>

              {result.inviteLink && <CopyLinkWidget inviteLink={result.inviteLink} />}
            </motion.div>
          )}
        </div>

        <SheetFooter className="border-t border-border px-6 py-4 mt-auto">
          {!result ? (
            <div className="flex gap-2 w-full sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={inviteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleInvite}
                disabled={emails.length === 0 || inviteMutation.isPending || isLimitError}
              >
                {inviteMutation.isPending ? "Sending..." : "Send invites"}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={handleReset} className="w-full sm:w-auto ml-auto">
              Invite more
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* Visual Role Selector Card Group */
interface RoleCardSelectorProps {
  value: UserRole;
  onChange: (value: UserRole) => void;
}

function RoleCardSelector({ value, onChange }: RoleCardSelectorProps) {
  const roles: { role: UserRole; title: string; description: string; icon: any }[] = [
    {
      role: "MEMBER",
      title: "Member",
      description: "Submit and track own commitments, view dashboards",
      icon: UserIcon,
    },
    {
      role: "MANAGER",
      title: "Manager",
      description: "Manage team commitments, meetings, and team settings",
      icon: ShieldIcon,
    },
    {
      role: "ADMIN",
      title: "Admin",
      description: "Full administrative access, manage members and billing",
      icon: Crown,
    },
  ];

  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Workspace Role
      </label>
      <div className="flex flex-col gap-2 relative">
        {roles.map((item) => {
          const isSelected = value === item.role;
          const Icon = item.icon;
          return (
            <button
              key={item.role}
              type="button"
              onClick={() => onChange(item.role)}
              className={cn(
                "group relative flex items-start gap-3.5 p-3 rounded-xl border text-left cursor-pointer outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand/20",
                isSelected
                  ? "border-brand bg-brand-subtle/20"
                  : "border-border hover:border-border-strong hover:bg-surface-hover/20"
              )}
            >
              {/* Highlight background capsule */}
              {isSelected && (
                <motion.div
                  layoutId="activeRoleBg"
                  className="absolute inset-0 bg-brand-subtle/10 border border-brand rounded-xl pointer-events-none"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}

              {/* Icon Container */}
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-200 relative z-10",
                  isSelected
                    ? "bg-brand/10 border-brand/20 text-brand"
                    : "bg-surface border-border text-muted-foreground group-hover:text-foreground group-hover:border-border-strong"
                )}
              >
                <Icon className="h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-110" />
              </div>

              {/* Text info */}
              <div className="flex flex-col pr-2 relative z-10">
                <span
                  className={cn(
                    "text-xs font-semibold tracking-tight transition-colors duration-200",
                    isSelected ? "text-brand" : "text-foreground"
                  )}
                >
                  {item.title}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  {item.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Copy Link Widget */
function CopyLinkWidget({ inviteLink }: { inviteLink: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // ignore
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-2">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        Or share this invite link directly
      </label>
      <div className="flex items-center gap-1.5 p-1.5 pl-2.5 rounded-lg border border-border bg-surface-hover/20">
        <span className="text-[11px] font-mono text-muted-foreground truncate flex-1 select-all">
          {inviteLink}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all duration-200 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-brand/20",
            copied
              ? "bg-success/10 border-success/30 text-success"
              : "bg-white hover:bg-surface-hover border-border text-foreground hover:border-border-strong"
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="copied"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-1"
              >
                <Check className="size-3" /> Copied!
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-1 text-muted-foreground"
              >
                <CopyIcon className="size-3" /> Copy link
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}

/* Local Email Chip Input Helper */
interface EmailChipInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  max?: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailChipInput({ value, onChange, max = 20 }: EmailChipInputProps) {
  const [inputValue, setInputValue] = useState("");

  const addEmail = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return;
    // Basic email check
    if (!trimmed.includes("@")) return;
    if (value.includes(trimmed)) return;
    if (value.length >= max) return;
    onChange([...value, trimmed]);
  };

  const removeEmail = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === ",") {
      e.preventDefault();
      addEmail(inputValue);
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeEmail(value.length - 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text");
    const emails = pastedData
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));
    const uniqueNewEmails = emails.filter((email) => !value.includes(email));
    const toAdd = uniqueNewEmails.slice(0, max - value.length);
    onChange([...value, ...toAdd]);
  };

  const isInputEmpty = !inputValue.trim();
  const isValidEmail = EMAIL_REGEX.test(inputValue.trim());

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-xs font-semibold text-muted-foreground uppercase">Teammate Emails</label>
      <div
        className={cn(
          "flex flex-wrap gap-1.5 p-2 min-h-[90px] rounded-lg cursor-text transition-all border bg-surface-hover/30 hover:bg-surface-hover/50 focus-within:bg-background",
          !isInputEmpty && !isValidEmail
            ? "border-amber-500/50 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/20"
            : !isInputEmpty && isValidEmail
            ? "border-success/50 focus-within:border-success focus-within:ring-1 focus-within:ring-success/20"
            : "border-border focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/20"
        )}
        onClick={() => document.getElementById("email-chip-input")?.focus()}
      >
        <AnimatePresence initial={false}>
          {value.map((email, idx) => (
            <motion.span
              key={email}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              layout
              className="inline-flex items-center gap-1.5 bg-brand-subtle border border-brand/20 text-[11px] px-2 py-0.5 rounded-md text-brand font-medium relative z-10"
            >
              <span className="truncate max-w-[150px]">{email}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeEmail(idx);
                }}
                className="hover:text-error text-brand/70 hover:bg-brand-subtle/50 rounded-full p-0.5 outline-none transition-colors"
              >
                <X className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          id="email-chip-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            if (inputValue.trim()) {
              addEmail(inputValue);
              setInputValue("");
            }
          }}
          placeholder={value.length === 0 ? "Type email and press Enter, Space, or Comma..." : ""}
          className="flex-1 min-w-[120px] bg-transparent outline-none border-0 p-1 text-xs text-foreground placeholder:text-muted-foreground relative z-10"
          disabled={value.length >= max}
        />
      </div>
      <div className="flex justify-between items-center text-[10px] min-h-5 px-0.5">
        <div>
          <AnimatePresence mode="wait">
            {isInputEmpty ? (
              <motion.span
                key="empty"
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 2 }}
                className="text-muted-foreground"
              >
                Press Enter, Space, or Comma to add
              </motion.span>
            ) : isValidEmail ? (
              <motion.span
                key="valid"
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 2 }}
                className="text-success font-medium flex items-center gap-1"
              >
                <Check className="size-3 text-success" /> Press Enter to add email
              </motion.span>
            ) : (
              <motion.span
                key="invalid"
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 2 }}
                className="text-amber-500 font-medium flex items-center gap-1"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Invalid email format
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="text-muted-foreground flex items-center gap-2">
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-brand hover:text-brand-mid font-medium cursor-pointer transition-colors"
            >
              Clear all
            </button>
          )}
          <span>
            {value.length}/{max} emails
          </span>
        </div>
      </div>
    </div>
  );
}

/* Result Row Component */
type InviteStatus = "invited" | "alreadyMember" | "alreadyInvited" | "failed";

function InviteResultRow({ email, status }: { email: string; status: InviteStatus }) {
  const config = {
    invited: { label: "Invited", icon: Check, class: "bg-success/15 text-success border-success/20" },
    alreadyMember: { label: "Already a member", icon: Minus, class: "bg-muted text-muted-foreground border-border" },
    alreadyInvited: { label: "Invite pending", icon: Clock, class: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    failed: { label: "Failed to invite", icon: X, class: "bg-error/15 text-error border-error/20" },
  }[status];

  return (
    <li className="flex items-center justify-between py-2 text-[12px] first:pt-1.5 last:pb-1.5">
      <span className="truncate text-muted-foreground pr-2 font-medium">{email}</span>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${config.class}`}>
        <config.icon className="size-2.5 stroke-[3px]" /> {config.label}
      </span>
    </li>
  );
}
