"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronsUpDown,
  Check,
  Plus,
  Settings,
  UserPlus,
  Search,
  Loader2,
  X,
  Building2,
  ArrowRight,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/shared/useMediaQuery";
import type { Workspace } from "./types";
import { useWorkspaces } from "./useWorkspaces";
import { toast } from "sonner";

/** Understated plan chip: neutral for free/trial plans, a whisper of brand green for paid ones. */
const PAID_PLANS = new Set(["pro", "starter", "business", "enterprise"]);
function planChipClass(plan?: string): string {
  return PAID_PLANS.has((plan ?? "").toLowerCase())
    ? "bg-brand/10 text-brand"
    : "bg-foreground/[0.06] text-muted-foreground";
}

export interface WorkspaceSwitcherProps {
  workspaces?: Workspace[];
  activeId?: string;
  onSelect?: (workspace: Workspace) => void;
  onCreateNew?: () => void;
  onOpenSettings?: () => void;
  onInviteMembers?: () => void;
  collapsed?: boolean;
  className?: string;
  side?: "right" | "bottom" | "top" | "left";
  align?: "start" | "center" | "end";
  /**
   * Presentation mode:
   * - "auto" (default): Swipeable Bottom Sheet Drawer on mobile (<768px), anchored Popover on desktop.
   * - "modal": Centered Dialog on desktop, Bottom Sheet Drawer on mobile.
   * - "popover": Forces Popover across all viewports.
   * - "drawer": Forces Bottom Sheet Drawer across all viewports.
   */
  mode?: "auto" | "modal" | "popover" | "drawer";
}

/**
 * Enterprise Principal SaaS Workspace Switcher Component
 * Fully responsive across Mobile, Tablet, and Desktop viewports.
 * Inspired by Linear, Vercel, Slack, and Apple HIG design systems.
 */
export function WorkspaceSwitcher({
  workspaces: customWorkspaces,
  activeId,
  onSelect,
  onCreateNew,
  onOpenSettings,
  onInviteMembers,
  collapsed = false,
  className = "",
  side = "right",
  align = "start",
  mode = "auto",
}: WorkspaceSwitcherProps) {
  const { workspaces: realWorkspaces, isLoading: isRealLoading } = useWorkspaces();
  const workspaces = customWorkspaces || realWorkspaces;

  const isMobile = useMediaQuery("(max-width: 768px)");
  const [mounted, setMounted] = useState(false);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>(
    activeId || workspaces.find((w) => w.active)?.id || workspaces[0]?.id || ""
  );
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync active item when workspaces update from API
  useEffect(() => {
    if (!selectedId || !workspaces.some((w) => w.id === selectedId)) {
      const activeWs = workspaces.find((w) => w.active) || workspaces[0];
      if (activeWs) setSelectedId(activeWs.id);
    }
  }, [workspaces, selectedId]);

  const activeWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === selectedId) || workspaces[0];
  }, [workspaces, selectedId]);

  const filteredWorkspaces = useMemo(() => {
    if (!search.trim()) return workspaces;
    const query = search.toLowerCase().trim();
    return workspaces.filter(
      (w) =>
        w.name.toLowerCase().includes(query) ||
        w.slug.toLowerCase().includes(query) ||
        w.plan.toLowerCase().includes(query)
    );
  }, [workspaces, search]);

  // Focus search input on open
  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Keyboard shortcuts (⌘K toggle, Arrow navigation, Enter select, ⌘1-9).
  // The handler is refreshed after every render but the window listener is attached ONCE — previously it was
  // removed and re-added on every hover/arrow press (each changes selectedIndex).
  const keydownHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keydownHandlerRef.current = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      if (!open) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredWorkspaces.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredWorkspaces.length - 1
        );
      } else if (e.key === "Enter" && filteredWorkspaces[selectedIndex]) {
        e.preventDefault();
        handleSelect(filteredWorkspaces[selectedIndex]);
      } else if (e.key === "Escape") {
        setOpen(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setOpen(false);
        if (onCreateNew) onCreateNew();
      } else if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setOpen(false);
        if (onOpenSettings) onOpenSettings();
      } else if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
        const index = parseInt(e.key, 10) - 1;
        if (workspaces[index]) {
          e.preventDefault();
          handleSelect(workspaces[index]);
        }
      }
    };
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => keydownHandlerRef.current(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSelect = (ws: Workspace) => {
    setSelectedId(ws.id);
    onSelect?.(ws);
    setOpen(false);
    toast.success(`Switched to ${ws.name}`, {
      duration: 2000,
    });
  };

  /**
   * Team Avatar Icon Rule:
   * Displays the first letter of the team name's first word.
   */
  const getFirstWordInitial = (name: string) => {
    if (!name) return "R";
    const firstWord = name.trim().split(/\s+/)[0];
    return firstWord ? firstWord.charAt(0).toUpperCase() : "R";
  };

  const hasValidLogo = (logo?: string) => {
    return typeof logo === "string" && logo.trim().length > 0;
  };

  // Determine effective rendering presentation mode
  const effectiveMode = useMemo(() => {
    if (!mounted) return "popover";
    if (mode === "drawer") return "drawer";
    if (mode === "modal") return isMobile ? "drawer" : "modal";
    if (mode === "popover") return "popover";
    // "auto" mode:
    return isMobile ? "drawer" : "popover";
  }, [mounted, mode, isMobile]);

  /**
   * Trigger Button Element
   * Responsive:
   * - In collapsed mode: Square icon button with status badge and Tooltip.
   * - In expanded mode: Full width with avatar, title, plan badge, member count, shortcut, and chevron.
   */
  const renderTriggerButton = () => {
    const memberCount = activeWorkspace?.membersCount ?? 0;
    const trigger = (
      <button
        type="button"
        aria-label={`Switch workspace. Active: ${activeWorkspace?.name || "Workspace"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
        className={cn(
          "group relative flex h-11 w-full select-none items-center gap-2.5 overflow-hidden rounded-lg px-1.5 text-left outline-none",
          "cursor-pointer touch-manipulation transition-[background-color,transform] duration-150 ease-out-soft",
          "hover:bg-foreground/[0.045] active:scale-[0.985] data-[state=open]:bg-foreground/[0.05]",
          "focus-visible:ring-2 focus-visible:ring-brand/40",
          className
        )}
      >
        {/* Workspace mark — same 28px footprint expanded and collapsed, so it never shifts */}
        <span
          className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[9px] text-[12px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.12)] transition-transform duration-200 ease-out-soft group-hover:scale-[1.04]"
          style={{
            backgroundColor: activeWorkspace?.isPersonal ? "hsl(149, 51%, 36%)" : "hsl(149, 61%, 28%)",
          }}
        >
          {hasValidLogo(activeWorkspace?.logo) ? (
            <img
              src={activeWorkspace?.logo}
              alt={activeWorkspace?.name || "Workspace logo"}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="select-none leading-none">{getFirstWordInitial(activeWorkspace?.name || "Rapto")}</span>
          )}
        </span>

        <span
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-1.5 transition-opacity duration-150 ease-out-soft",
            collapsed ? "opacity-0" : "opacity-100 delay-75"
          )}
        >
          <span className="truncate text-[13px] font-medium leading-none tracking-[-0.006em] text-foreground">
            {activeWorkspace?.name}
          </span>
          <span className="flex items-center gap-1.5 leading-none">
            <span
              className={cn(
                "shrink-0 rounded px-1 py-[3px] text-[9.5px] font-medium uppercase leading-none tracking-[0.06em]",
                planChipClass(activeWorkspace?.plan)
              )}
            >
              {activeWorkspace?.plan}
            </span>
            <span className="truncate text-[11px] leading-none text-muted-foreground">
              {memberCount} member{memberCount !== 1 ? "s" : ""}
            </span>
          </span>
        </span>

        <ChevronsUpDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-subtle transition-[opacity,color] duration-150 group-hover:text-foreground",
            open && "text-foreground",
            collapsed ? "opacity-0" : "opacity-100 delay-75"
          )}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
    );

    // Icon-only rail: show the workspace name and shortcut in a tooltip while the menu is closed
    if (collapsed && !open) {
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={12} className="gap-2 px-2.5 py-1 text-[11.5px]">
              <span className="font-medium">{activeWorkspace?.name || "Switch workspace"}</span>
              <kbd className="font-mono text-[10px] opacity-60">⌘K</kbd>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return trigger;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 1. MOBILE BOTTOM SHEET DRAWER (Mobile < 768px)
  // ─────────────────────────────────────────────────────────────────────────
  if (effectiveMode === "drawer") {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{renderTriggerButton()}</DrawerTrigger>
        <DrawerContent className="max-h-[90dvh] flex flex-col bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 rounded-t-2xl p-0 gap-0 outline-none z-[70]">
          {/* Header */}
          <DrawerHeader className="px-5 pt-3 pb-3 border-b border-zinc-100 dark:border-zinc-800/80 text-left flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand border border-brand/20">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <DrawerTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Switch Workspace
                </DrawerTitle>
                <DrawerDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""} available
                </DrawerDescription>
              </div>
            </div>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </DrawerHeader>

          {/* Search Box - Sticky */}
          <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-zinc-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search workspaces..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedIndex(0);
                }}
                /* text-base prevents iOS Safari auto-zoom bug on input focus */
                className="w-full h-10 pl-9 pr-16 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 text-base sm:text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Workspaces List with WCAG touch targets (>= 48px) */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 custom-scrollbar touch-pan-y">
            <div className="flex items-center justify-between px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <span>Workspaces ({filteredWorkspaces.length})</span>
              {isRealLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
            </div>

            {filteredWorkspaces.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
                No workspace found matching &ldquo;{search}&rdquo;
              </div>
            ) : (
              filteredWorkspaces.map((ws) => {
                const isActive = ws.id === selectedId;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => handleSelect(ws)}
                    className={cn(
                      "group relative flex w-full items-center justify-between rounded-xl p-3 text-left transition-all duration-150 outline-none cursor-pointer active:scale-[0.99] touch-manipulation min-h-[54px]",
                      isActive
                        ? "bg-brand/10 border border-brand/30 text-zinc-900 dark:text-zinc-100 ring-1 ring-brand/20"
                        : "bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-200/70 dark:border-zinc-800/70 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-2xs overflow-hidden"
                        style={{
                          backgroundColor: ws.isPersonal
                            ? "hsl(149, 51%, 36%)"
                            : "hsl(149, 61%, 28%)",
                        }}
                      >
                        {hasValidLogo(ws.logo) ? (
                          <img
                            src={ws.logo}
                            alt={ws.name}
                            className="h-full w-full rounded-lg object-cover"
                          />
                        ) : (
                          <span className="text-white font-bold leading-none select-none">
                            {getFirstWordInitial(ws.name)}
                          </span>
                        )}
                        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-zinc-950" />
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {ws.name}
                          </span>
                          {ws.isPersonal && (
                            <span className="text-[9px] font-medium px-1.5 py-0.2 rounded-full bg-zinc-200/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                              Personal
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal">
                          {ws.membersCount} member{ws.membersCount !== 1 ? "s" : ""} • {ws.role}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          "text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border",
                          ws.plan === "Enterprise"
                            ? "bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 border-transparent font-bold"
                            : ws.plan === "Pro"
                            ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60"
                            : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-700/60"
                        )}
                      >
                        {ws.plan}
                      </span>

                      {isActive ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white shadow-2xs">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Quick Action Commands (Ergonomic Thumb Reach) */}
          <div className="border-t border-zinc-100 dark:border-zinc-800/80 p-3 bg-zinc-50/70 dark:bg-zinc-900/50 space-y-2 pb-safe pb-4">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (onCreateNew) onCreateNew();
                else toast.info("Opening Create Workspace dialog...");
              }}
              className="flex w-full h-11 items-center justify-between rounded-xl px-3.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition cursor-pointer active:scale-[0.99] touch-manipulation"
            >
              <div className="flex items-center gap-2.5">
                <Plus className="h-4 w-4 text-brand" />
                <span>Create new workspace</span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (onOpenSettings) onOpenSettings();
                  else toast.info("Navigating to Workspace Settings...");
                }}
                className="flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition cursor-pointer active:scale-[0.99] touch-manipulation"
              >
                <Settings className="h-3.5 w-3.5 text-zinc-500" />
                <span>Settings</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (onInviteMembers) onInviteMembers();
                  else toast.info("Opening Invite Teammates sheet...");
                }}
                className="flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition cursor-pointer active:scale-[0.99] touch-manipulation"
              >
                <UserPlus className="h-3.5 w-3.5 text-zinc-500" />
                <span>Invite</span>
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. CENTERED MODAL DIALOG (When mode="modal" on Desktop)
  // ─────────────────────────────────────────────────────────────────────────
  if (effectiveMode === "modal") {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{renderTriggerButton()}</DialogTrigger>
        <DialogContent
          showCloseButton={true}
          className="sm:max-w-[440px] p-0 gap-0 overflow-hidden border border-zinc-200/90 dark:border-zinc-800/90 shadow-2xl rounded-2xl bg-white dark:bg-zinc-950 outline-none"
        >
          <DialogHeader className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/80 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand border border-brand/20">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <DialogTitle className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Switch Workspace
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  Select a team or manage your workspaces.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Search Header */}
          <div className="relative flex items-center border-b border-zinc-100 dark:border-zinc-800/80 px-3.5 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search workspaces..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedIndex(0);
              }}
              className="w-full bg-transparent px-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-[10px] font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-1 cursor-pointer"
              >
                Clear
              </button>
            ) : (
              <kbd className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-200/60 dark:border-zinc-800">
                ESC
              </kbd>
            )}
          </div>

          {/* Workspaces List */}
          <div className="max-h-[280px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {filteredWorkspaces.map((ws, idx) => {
              const isActive = ws.id === selectedId;
              const isFocused = idx === selectedIndex;

              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSelect(ws)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "group relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs transition-colors duration-150 outline-none cursor-pointer",
                    isActive
                      ? "bg-zinc-100/90 dark:bg-zinc-900/90 font-medium text-zinc-900 dark:text-zinc-100"
                      : isFocused
                      ? "bg-zinc-100/60 dark:bg-zinc-900/60 text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white shadow-2xs overflow-hidden"
                      style={{
                        backgroundColor: ws.isPersonal
                          ? "hsl(149, 51%, 36%)"
                          : "hsl(149, 61%, 28%)",
                      }}
                    >
                      {hasValidLogo(ws.logo) ? (
                        <img src={ws.logo} alt={ws.name} className="h-full w-full rounded-lg object-cover" />
                      ) : (
                        <span className="text-white font-bold leading-none select-none">
                          {getFirstWordInitial(ws.name)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium tracking-tight">
                          {ws.name}
                        </span>
                        {ws.isPersonal && (
                          <span className="text-[9px] font-normal px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            Personal
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">
                        {ws.membersCount} member{ws.membersCount !== 1 ? "s" : ""} • {ws.role}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "text-[9.5px] font-semibold uppercase px-1.5 py-0.5 rounded-sm border",
                        ws.plan === "Enterprise"
                          ? "bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 border-transparent font-bold"
                          : ws.plan === "Pro"
                          ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60"
                          : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-700/60"
                      )}
                    >
                      {ws.plan}
                    </span>

                    {isActive ? (
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </div>
                    ) : ws.shortcut ? (
                      <kbd className="hidden sm:inline-flex text-[9px] font-mono text-zinc-400 dark:text-zinc-500">
                        {ws.shortcut}
                      </kbd>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Actions Footer */}
          <div className="border-t border-zinc-100 dark:border-zinc-800/80 p-2 bg-zinc-50/50 dark:bg-zinc-950/50 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (onCreateNew) onCreateNew();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-zinc-500" />
              <span>Create workspace</span>
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (onOpenSettings) onOpenSettings();
                }}
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                title="Workspace settings (⌘,)"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (onInviteMembers) onInviteMembers();
                }}
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                title="Invite members"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. ANCHORED COMMAND POPOVER (Desktop / Tablet >= 768px)
  // ─────────────────────────────────────────────────────────────────────────
  const actionRow =
    "flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-[13px] text-foreground/85 outline-none transition-colors duration-150 hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05]";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{renderTriggerButton()}</PopoverTrigger>

      <PopoverContent
        side={side}
        align={align}
        sideOffset={10}
        avoidCollisions={true}
        collisionPadding={12}
        className="z-50 w-[300px] max-w-[calc(100vw-24px)] gap-0 overflow-hidden rounded-xl border-0 bg-white p-0 font-sans text-foreground shadow-xl ring-1 ring-foreground/10 outline-none duration-150 dark:bg-background"
      >
        {/* Search */}
        <div className="flex h-10 items-center gap-2 border-b border-border/70 px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-subtle" strokeWidth={1.75} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search workspaces…"
            aria-label="Search workspaces"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-subtle"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="cursor-pointer text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear
            </button>
          ) : (
            <kbd className="rounded border border-border/70 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-subtle">ESC</kbd>
          )}
        </div>

        {/* Workspaces */}
        <div className="max-h-[264px] overflow-y-auto p-1.5">
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1 text-[10.5px] font-medium uppercase leading-none tracking-[0.09em] text-muted-subtle">
            <span>Workspaces</span>
            {isRealLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>

          {filteredWorkspaces.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              No workspace found for &ldquo;{search}&rdquo;
            </div>
          ) : (
            filteredWorkspaces.map((ws, idx) => {
              const isActive = ws.id === selectedId;
              const isFocused = idx === selectedIndex;

              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSelect(ws)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none",
                    "transition-colors duration-150",
                    isFocused || isActive ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]"
                  )}
                >
                  <span
                    className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[9px] text-[12px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                    style={{ backgroundColor: ws.isPersonal ? "hsl(149, 51%, 36%)" : "hsl(149, 61%, 28%)" }}
                  >
                    {hasValidLogo(ws.logo) ? (
                      <img src={ws.logo} alt={ws.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="select-none leading-none">{getFirstWordInitial(ws.name)}</span>
                    )}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium leading-none tracking-[-0.006em] text-foreground">
                        {ws.name}
                      </span>
                      {ws.isPersonal && (
                        <span className="shrink-0 rounded bg-foreground/[0.06] px-1 py-[2px] text-[9.5px] leading-none text-muted-foreground">
                          Personal
                        </span>
                      )}
                    </span>
                    <span className="truncate text-[11px] leading-none text-muted-foreground">
                      {ws.membersCount} member{ws.membersCount !== 1 ? "s" : ""} · {ws.role}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-1 py-[3px] text-[9.5px] font-medium uppercase leading-none tracking-[0.06em]",
                        planChipClass(ws.plan)
                      )}
                    >
                      {ws.plan}
                    </span>
                    {isActive ? (
                      <Check className="h-3.5 w-3.5 text-brand" strokeWidth={2.25} aria-label="Current workspace" />
                    ) : (
                      ws.shortcut && (
                        <kbd className="hidden font-mono text-[9.5px] text-muted-subtle sm:inline-flex">{ws.shortcut}</kbd>
                      )
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-border/70 p-1.5">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              if (onCreateNew) onCreateNew();
              else toast.info("Opening Create Workspace dialog...");
            }}
            className={actionRow}
          >
            <span className="flex items-center gap-2.5">
              <Plus className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              Create new workspace
            </span>
            <kbd className="font-mono text-[9.5px] text-muted-subtle">⌘N</kbd>
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              if (onOpenSettings) onOpenSettings();
              else toast.info("Navigating to Workspace Settings...");
            }}
            className={actionRow}
          >
            <span className="flex items-center gap-2.5">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              Workspace settings
            </span>
            <kbd className="font-mono text-[9.5px] text-muted-subtle">⌘,</kbd>
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              if (onInviteMembers) onInviteMembers();
              else toast.info("Opening Invite Teammates sheet...");
            }}
            className={actionRow}
          >
            <span className="flex items-center gap-2.5">
              <UserPlus className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              Invite members
            </span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
