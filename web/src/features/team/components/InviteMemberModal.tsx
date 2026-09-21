// web/src/features/team/components/InviteMemberModal.tsx

"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Check,
  Minus,
  Clock,
  X,
  Crown,
  UserPlus,
  User as UserIcon,
  Shield as ShieldIcon,
  Copy as CopyIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useInviteMembers } from "../hooks/useInviteMembers";
import { useTeam } from "../hooks/useTeam";
import { useMediaQuery } from "@/hooks/shared/useMediaQuery";
import { useUIStore } from "@/store/ui.store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { InviteResult, UserRole } from "../types/team.types";

import { getAppUrl } from "@/config/env";

export interface InviteMemberModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  teamName?: string;
}

/**
 * Enterprise Responsive Invite Member Component.
 * - On Desktop (>= 768px): Renders as a centered Modal Dialog.
 * - On Mobile (< 768px): Renders as a swipeable Bottom Sheet Drawer.
 */
export function InviteMemberModal({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  teamName,
}: InviteMemberModalProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [mounted, setMounted] = useState(false);

  // Global store integration
  const storeOpen = useUIStore((state) => state.inviteModalOpen);
  const setStoreOpen = useUIStore((state) => state.setInviteModalOpen);

  const isControlled = typeof controlledOpen === "boolean";
  const isOpen = isControlled ? controlledOpen : storeOpen;
  const setIsOpen = isControlled ? controlledOnOpenChange! : setStoreOpen;

  // Form State
  const [emails, setEmails] = useState<string[]>([]);
  const [role, setRole] = useState<UserRole>("MEMBER");
  const [result, setResult] = useState<InviteResult | null>(null);

  const inviteMutation = useInviteMembers();
  const { data: teamDetail } = useTeam();

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const handleClose = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Small timeout to avoid content flash during exit animation
      setTimeout(() => {
        handleReset();
      }, 200);
    }
  };

  const isLimitError =
    inviteMutation.error?.response?.data?.error?.code === "PLAN_LIMIT_REACHED" ||
    inviteMutation.error?.response?.data?.error?.code === "PLAN_LIMIT" ||
    inviteMutation.error?.code === "PLAN_LIMIT";

  const resolvedTeamName = teamName || teamDetail?.name || "your workspace";
  const appBaseUrl = getAppUrl();

  // Normalize any backend invite link to match production domain (app.rapto.cloud) or local dev URL
  const normalizeLink = (link?: string) => {
    if (!link) return "";
    try {
      const parsed = new URL(link);
      return `${appBaseUrl}${parsed.pathname}${parsed.search}`;
    } catch {
      return link;
    }
  };

  const shareableInviteLink =
    normalizeLink(result?.inviteLink) ||
    (teamDetail?.slug ? `${appBaseUrl}/teams/${teamDetail.slug}/join` : "");

  if (!mounted) return null;

  // ── Mobile: Bottom Sheet Drawer ──────────────────────────────────────────
  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={handleClose}>
        <DrawerContent className="max-h-[90vh] flex flex-col bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 rounded-t-2xl p-0 gap-0 outline-none">
          <DrawerHeader className="px-5 pt-3 pb-3 border-b border-zinc-100 dark:border-zinc-800/80 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand border border-brand/20">
                <UserPlus className="h-4 w-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <DrawerTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  Invite teammates to {resolvedTeamName}
                </DrawerTitle>
                <DrawerDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  Send email invites or share direct link
                </DrawerDescription>
              </div>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
            <InviteModalBody
              isLimitError={isLimitError}
              inviteMutation={inviteMutation}
              emails={emails}
              setEmails={setEmails}
              role={role}
              setRole={setRole}
              result={result}
              shareableInviteLink={shareableInviteLink}
            />
          </div>

          <DrawerFooter className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
            <InviteModalActions
              result={result}
              emailsCount={emails.length}
              isPending={inviteMutation.isPending}
              isLimitError={isLimitError}
              onClose={() => handleClose(false)}
              onInvite={handleInvite}
              onReset={handleReset}
            />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  // ── Desktop: Centered Modal Dialog ───────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        showCloseButton={true}
        className="sm:max-w-[500px] p-0 gap-0 overflow-hidden border border-zinc-200/90 dark:border-zinc-800/90 shadow-2xl rounded-2xl bg-white dark:bg-zinc-950 outline-none"
      >
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800/80 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand border border-brand/20 shadow-2xs">
              <UserPlus className="h-4.5 w-4.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <DialogTitle className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Invite teammates to {resolvedTeamName}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Send email invites to collaborate on commitments and meetings.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 overflow-y-auto max-h-[calc(85vh-160px)] space-y-5 custom-scrollbar">
          <InviteModalBody
            isLimitError={isLimitError}
            inviteMutation={inviteMutation}
            emails={emails}
            setEmails={setEmails}
            role={role}
            setRole={setRole}
            result={result}
            shareableInviteLink={shareableInviteLink}
          />
        </div>

        <DialogFooter className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 sm:justify-between items-center">
          <InviteModalActions
            result={result}
            emailsCount={emails.length}
            isPending={inviteMutation.isPending}
            isLimitError={isLimitError}
            onClose={() => handleClose(false)}
            onInvite={handleInvite}
            onReset={handleReset}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared Content Body ───────────────────────────────────────────────────

interface InviteModalBodyProps {
  isLimitError: boolean;
  inviteMutation: any;
  emails: string[];
  setEmails: (emails: string[]) => void;
  role: UserRole;
  setRole: (role: UserRole) => void;
  result: InviteResult | null;
  shareableInviteLink: string;
}

function InviteModalBody({
  isLimitError,
  inviteMutation,
  emails,
  setEmails,
  role,
  setRole,
  result,
  shareableInviteLink,
}: InviteModalBodyProps) {
  return (
    <>
      {/* Plan Capacity Reached Banner */}
      {isLimitError && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 shadow-2xs flex flex-col gap-2.5">
          <div className="flex items-start gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Crown className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Workspace Member Limit Reached
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed mt-0.5">
                Your workspace has reached the member cap for the current plan. Upgrade to invite more teammates.
              </span>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 font-semibold px-3"
              onClick={() => {
                const upgradeUrl =
                  inviteMutation.error?.response?.data?.error?.details?.upgradeUrl || "/settings/billing";
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
          {/* Multi-Email Tag Chip Input */}
          <EmailChipInput value={emails} onChange={setEmails} max={20} />

          {/* Role Selection Group */}
          <RoleCardSelector value={role} onChange={setRole} />

          {/* Shareable Invite Link */}
          {shareableInviteLink && (
            <CopyLinkWidget inviteLink={shareableInviteLink} />
          )}
        </>
      ) : (
        /* Results Panel */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-4"
        >
          {/* Success Header */}
          <div className="flex flex-col items-center justify-center p-4 text-center rounded-xl bg-brand-subtle/30 dark:bg-brand/10 border border-brand/20">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white mb-2 shadow-xs">
              <Check className="h-5 w-5 stroke-[3]" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Invitations Sent
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-[280px]">
              We&apos;ve sent email invitations to your teammates. They can join your workspace immediately.
            </p>
          </div>

          {/* Results List */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-1">
              Invitation Status
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 px-3 py-1 overflow-hidden">
              {result.invited.map((email) => (
                <InviteResultRow
                  key={email}
                  email={email}
                  status="invited"
                  inviteUrl={result.inviteLinks?.[email] ? shareableInviteLink : shareableInviteLink}
                />
              ))}
              {result.alreadyMember.map((email) => (
                <InviteResultRow key={email} email={email} status="alreadyMember" />
              ))}
              {result.alreadyInvited.map((email) => (
                <InviteResultRow
                  key={email}
                  email={email}
                  status="alreadyInvited"
                  inviteUrl={shareableInviteLink}
                />
              ))}
              {result.failed.map((email) => (
                <InviteResultRow key={email} email={email} status="failed" />
              ))}
            </ul>
          </div>

          {shareableInviteLink && (
            <CopyLinkWidget
              inviteLink={shareableInviteLink}
              title="Direct workspace invitation link"
            />
          )}
        </motion.div>
      )}
    </>
  );
}

// ── Shared Action Buttons ─────────────────────────────────────────────────

interface InviteModalActionsProps {
  result: InviteResult | null;
  emailsCount: number;
  isPending: boolean;
  isLimitError: boolean;
  onClose: () => void;
  onInvite: () => void;
  onReset: () => void;
}

function InviteModalActions({
  result,
  emailsCount,
  isPending,
  isLimitError,
  onClose,
  onInvite,
  onReset,
}: InviteModalActionsProps) {
  if (!result) {
    return (
      <div className="flex items-center justify-between w-full gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={isPending}
          className="text-xs h-9 px-4 text-zinc-600 dark:text-zinc-400"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onInvite}
          disabled={emailsCount === 0 || isPending || isLimitError}
          className="text-xs h-9 px-5 bg-brand hover:bg-brand/90 text-white font-medium gap-1.5 shadow-2xs"
        >
          {isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" />
              <span>
                {emailsCount > 1
                  ? `Send ${emailsCount} invites`
                  : "Send invite"}
              </span>
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between w-full gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onReset}
        className="text-xs h-9 px-4 text-zinc-700 dark:text-zinc-300"
      >
        Invite more
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={onClose}
        className="text-xs h-9 px-5 bg-brand hover:bg-brand/90 text-white font-medium shadow-2xs"
      >
        Done
      </Button>
    </div>
  );
}

// ── Role Selector Card Group ──────────────────────────────────────────────

interface RoleCardSelectorProps {
  value: UserRole;
  onChange: (value: UserRole) => void;
}

function RoleCardSelector({ value, onChange }: RoleCardSelectorProps) {
  const roles: { role: UserRole; title: string; description: string; icon: any }[] = [
    {
      role: "MEMBER",
      title: "Member",
      description: "Submit and track commitments, join meetings, and view dashboards.",
      icon: UserIcon,
    },
    {
      role: "MANAGER",
      title: "Manager",
      description: "Manage team commitments, run syncs, and adjust team settings.",
      icon: ShieldIcon,
    },
    {
      role: "ADMIN",
      title: "Admin",
      description: "Full administrative access, manage members, billing, and settings.",
      icon: Crown,
    },
  ];

  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
        Workspace Role
      </label>
      <div className="grid grid-cols-1 gap-2">
        {roles.map((item) => {
          const isSelected = value === item.role;
          const Icon = item.icon;
          return (
            <button
              key={item.role}
              type="button"
              onClick={() => onChange(item.role)}
              className={cn(
                "group relative flex items-start gap-3 p-2.5 rounded-xl border text-left cursor-pointer outline-none transition-all duration-150 select-none",
                isSelected
                  ? "border-brand bg-brand-subtle/25 dark:bg-brand/10 ring-1 ring-brand/30"
                  : "border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors mt-0.5",
                  isSelected
                    ? "bg-brand text-white border-brand shadow-2xs"
                    : "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-300"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>

              <div className="flex flex-col min-w-0 pr-1 flex-1">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-xs font-semibold tracking-tight",
                      isSelected
                        ? "text-brand dark:text-brand-dark"
                        : "text-zinc-900 dark:text-zinc-100"
                    )}
                  >
                    {item.title}
                  </span>
                  {isSelected && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5">
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

// ── Multi-Email Tag Chip Input ────────────────────────────────────────────

interface EmailChipInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  max?: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailChipInput({ value, onChange, max = 20 }: EmailChipInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [highlightLast, setHighlightLast] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addEmail = (raw: string) => {
    const trimmed = raw.trim().replace(/,$/, "");
    if (!trimmed) return;
    if (!trimmed.includes("@")) return;
    if (value.includes(trimmed)) {
      setInputValue("");
      return;
    }
    if (value.length >= max) return;
    onChange([...value, trimmed]);
    setInputValue("");
    setHighlightLast(false);
  };

  const removeEmail = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
    setHighlightLast(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === ",") {
      e.preventDefault();
      addEmail(inputValue);
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      if (highlightLast) {
        removeEmail(value.length - 1);
      } else {
        setHighlightLast(true);
      }
    } else {
      setHighlightLast(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text");
    const extracted = pastedData
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => EMAIL_REGEX.test(s));
    const unique = extracted.filter((e) => !value.includes(e));
    const toAdd = unique.slice(0, max - value.length);
    if (toAdd.length > 0) {
      onChange([...value, ...toAdd]);
    }
    setInputValue("");
  };

  const isInputEmpty = !inputValue.trim();
  const isValidEmail = EMAIL_REGEX.test(inputValue.trim());

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          Teammate Emails
        </label>
        <span className="text-[10.5px] text-zinc-400 dark:text-zinc-500">
          {value.length}/{max} emails
        </span>
      </div>

      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex flex-wrap gap-1.5 p-2 min-h-[88px] rounded-xl cursor-text transition-all border bg-zinc-50/50 dark:bg-zinc-900/30",
          !isInputEmpty && !isValidEmail
            ? "border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/20"
            : !isInputEmpty && isValidEmail
            ? "border-emerald-500 dark:border-emerald-500 ring-1 ring-emerald-500/20"
            : "border-zinc-200/90 dark:border-zinc-800/90 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
        )}
      >
        <AnimatePresence initial={false}>
          {value.map((email, idx) => {
            const isLast = idx === value.length - 1 && highlightLast;
            return (
              <motion.span
                key={email}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.12 }}
                layout
                className={cn(
                  "inline-flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/80 text-xs px-2.5 py-1 rounded-lg font-medium select-none",
                  isLast && "ring-2 ring-zinc-500 dark:ring-zinc-400"
                )}
              >
                <span className="truncate max-w-[170px]">{email}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeEmail(idx);
                  }}
                  className="text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 rounded p-0.5 outline-none transition-colors"
                  aria-label={`Remove ${email}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.span>
            );
          })}
        </AnimatePresence>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setHighlightLast(false);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            if (inputValue.trim() && isValidEmail) {
              addEmail(inputValue);
            }
          }}
          placeholder={value.length === 0 ? "colleague@company.com" : "Add more..."}
          className="flex-1 min-w-[130px] bg-transparent outline-none border-0 p-1 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-sans"
          disabled={value.length >= max}
        />
      </div>

      <div className="flex justify-between items-center text-[10.5px] min-h-5 px-0.5">
        <div>
          {isInputEmpty ? (
            <span className="text-zinc-400 dark:text-zinc-500">
              Press Enter, comma, or space to add
            </span>
          ) : isValidEmail ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <Check className="h-3 w-3 text-emerald-500" /> Press Enter to add
            </span>
          ) : (
            <span className="text-amber-500 font-medium flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Incomplete email format
            </span>
          )}
        </div>

        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-brand hover:text-brand-dark dark:hover:text-brand font-medium cursor-pointer transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

// ── Copy Direct Invite Link Widget ────────────────────────────────────────

function CopyLinkWidget({
  inviteLink,
  title = "Or share invite link directly",
}: {
  inviteLink: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="flex flex-col gap-1.5 w-full pt-1">
      <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
        {title}
      </label>
      <div className="flex items-center gap-2 p-1.5 pl-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/40">
        <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate flex-1 select-all">
          {inviteLink}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer outline-none shrink-0",
            copied
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200"
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="copied"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
              >
                <Check className="h-3 w-3 stroke-[3]" /> Copied!
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="flex items-center gap-1 text-zinc-700 dark:text-zinc-300"
              >
                <CopyIcon className="h-3 w-3" /> Copy link
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}

// ── Result Status Row ─────────────────────────────────────────────────────

type InviteStatus = "invited" | "alreadyMember" | "alreadyInvited" | "failed";

function InviteResultRow({
  email,
  status,
  inviteUrl,
}: {
  email: string;
  status: InviteStatus;
  inviteUrl?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const config = {
    invited: {
      label: "Invited",
      icon: Check,
      class: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    },
    alreadyMember: {
      label: "Already member",
      icon: Minus,
      class: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
    },
    alreadyInvited: {
      label: "Invite pending",
      icon: Clock,
      class: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    },
    failed: {
      label: "Failed to invite",
      icon: X,
      class: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    },
  }[status];

  const Icon = config.icon;

  return (
    <li className="flex items-center justify-between py-2 text-xs first:pt-1.5 last:pb-1.5 gap-2">
      <span className="truncate text-zinc-700 dark:text-zinc-300 font-medium flex-1">
        {email}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {inviteUrl && (status === "invited" || status === "alreadyInvited") && (
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition cursor-pointer border border-zinc-200/60 dark:border-zinc-700/60"
            title="Copy invite link for this teammate"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500 stroke-[3]" />
            ) : (
              <CopyIcon className="h-3 w-3 text-zinc-400" />
            )}
            <span>{copied ? "Copied" : "Copy link"}</span>
          </button>
        )}
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0",
            config.class
          )}
        >
          <Icon className="h-2.5 w-2.5 stroke-[3]" /> {config.label}
        </span>
      </div>
    </li>
  );
}
