"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  Sparkles,
  TrendingUp,
  Check,
  LayoutDashboard,
} from "lucide-react";
import { NavLogo } from "@/components/ui/NavLogo";
import { useAuth } from "@/features/auth/hooks/useAuth";

const EASE = [0.16, 1, 0.3, 1] as const;

const STATS = [
  {
    label: "Commitments Met",
    value: "94.2%",
    unit: null,
    note: "+12.4% vs last week",
    positive: true,
    Icon: TrendingUp,
  },
  {
    label: "Active Follow-ups",
    value: "18",
    unit: "Items",
    note: "3 due today",
    positive: false,
    Icon: Clock,
  },
  {
    label: "AI Accuracy Score",
    value: "99.8%",
    unit: null,
    note: "Zero hallucinations",
    positive: true,
    Icon: Sparkles,
  },
] as const;

const COMMITMENTS = [
  {
    id: "item-1",
    title: "Ship updated API rate limiter & CORS policy to production cluster",
    assignee: "Uzair",
    due: "Today 5:00 PM",
    dueUrgent: true,
    status: "Confirmed",
    statusTone: "brand",
  },
  {
    id: "item-2",
    title: "Review Q3 infrastructure roadmap with DevOps team",
    assignee: "Sarah K.",
    due: "Tomorrow 2:00 PM",
    dueUrgent: false,
    status: "In Progress",
    statusTone: "neutral",
  },
] as const;

export function LandingHero() {
  const { isAuthenticated, user, isLoading } = useAuth();
  const reduceMotion = useReducedMotion();
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({
    "item-2": true,
  });

  const toggleItem = (id: string) => {
    setCompletedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // One entrance recipe for every block; collapses to nothing under reduced motion.
  const reveal = (delay: number, distance = 14) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: distance },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: EASE },
        };

  const signedIn = !isLoading && isAuthenticated && user;

  return (
    <div className="home-surface relative flex min-h-screen flex-col overflow-x-clip bg-paper font-sans text-ink selection:bg-leaf-tint selection:text-leaf">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-hairline bg-paper/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="relative z-10 mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6">
          <NavLogo
            href="/"
            className="flex items-center rounded-sm text-xl font-bold tracking-tight text-ink transition-opacity hover:opacity-80"
          />

          <div className="flex items-center gap-1 sm:gap-2">
            {signedIn ? (
              <Link href="/dashboard" className="btn-rapto btn-rapto-ink">
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-2 text-[13px] font-medium text-ink-2 transition-colors duration-150 hover:bg-ink/[0.04] hover:text-ink"
                >
                  Sign In
                </Link>
                <Link href="/register" className="btn-rapto btn-rapto-ink">
                  Start Free Trial
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-5 pb-24 pt-16 text-center sm:px-6 sm:pt-24">
        {/* Eyebrow */}
        <motion.div
          {...reveal(0, 8)}
          className="mb-8 inline-flex select-none items-center gap-2.5 rounded-full border border-hairline bg-white/70 py-1.5 pl-2.5 pr-3.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-2 shadow-[0_1px_2px_rgba(27,35,32,0.04),inset_0_1px_0_#fff]"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf opacity-40 motion-reduce:hidden" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-leaf" />
          </span>
          AI Meeting Accountability
        </motion.div>

        {/* Headline — serif for the statement, green italic for the promise */}
        <motion.h1
          {...reveal(0.08, 18)}
          className="mx-auto max-w-4xl text-balance font-serif text-[clamp(44px,7vw,88px)] font-normal leading-[1.02] tracking-[-0.028em] text-ink"
        >
          Never lose track of what your team{" "}
          <em className="whitespace-nowrap pr-[0.04em] italic text-leaf">commits to.</em>
        </motion.h1>

        {/* Description */}
        <motion.p
          {...reveal(0.16)}
          className="mx-auto mt-7 max-w-[34rem] text-pretty text-[17px] font-normal leading-[1.65] tracking-[-0.003em] text-ink-2 sm:text-[19px]"
        >
          Rapto AI remembers every commitment made in your meetings and follows up
          automatically — turning verbal promises into accountable deliverables.
        </motion.p>

        {/* Actions */}
        <motion.div
          {...reveal(0.24)}
          className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row"
        >
          {signedIn ? (
            <Link href="/dashboard" className="btn-rapto group w-full sm:w-auto">
              <span>Go to Dashboard</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <>
              <Link href="/register" className="btn-rapto group w-full sm:w-auto">
                <span>Start Free Trial</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
              </Link>
              <Link href="/login" className="btn-rapto btn-rapto-quiet w-full sm:w-auto">
                Sign In
              </Link>
            </>
          )}
        </motion.div>

        {/* Product preview — bezel + window, layered shadows for natural depth */}
        <motion.div
          {...reveal(0.34, 32)}
          className="mt-16 w-full select-none rounded-[22px] border border-hairline bg-white/45 p-1.5 text-left shadow-[0_1px_1px_rgba(27,35,32,0.04),0_2px_4px_rgba(27,35,32,0.04),0_8px_16px_rgba(27,35,32,0.05),0_24px_48px_-8px_rgba(27,35,32,0.08),0_56px_96px_-24px_rgba(27,35,32,0.12)] sm:mt-20"
        >
          <div className="overflow-hidden rounded-2xl border border-hairline bg-paper shadow-[inset_0_1px_0_#fff]">
            {/* Window chrome */}
            <div className="flex items-center justify-between gap-3 border-b border-hairline bg-paper-2/70 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-ink/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-ink/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-ink/10" />
                </div>
                <span className="hidden truncate rounded-md border border-hairline bg-white/70 px-2.5 py-0.5 font-mono text-[11px] text-ink-3 sm:inline">
                  app.rapto.cloud/dashboard
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-leaf/15 bg-leaf-tint px-2.5 py-1 text-[11px] font-medium text-leaf">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf opacity-40 motion-reduce:hidden" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-leaf" />
                </span>
                Live Syncing Active
              </div>
            </div>

            {/* Dashboard content */}
            <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
              {/* Metrics */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                {STATS.map(({ label, value, unit, note, positive, Icon }) => (
                  <div
                    key={label}
                    className="group rounded-xl border border-hairline bg-white p-4 shadow-[0_1px_1px_rgba(27,35,32,0.03),0_1px_3px_rgba(27,35,32,0.04)] transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-[0_1px_1px_rgba(27,35,32,0.03),0_8px_20px_-6px_rgba(27,35,32,0.10)]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ink-3">{label}</span>
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                          positive ? "bg-leaf-tint text-leaf" : "bg-paper-2 text-ink-3"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                      </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-1.5">
                      <span className="text-[28px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
                        {value}
                      </span>
                      {unit && (
                        <span className="text-sm font-medium text-ink-3">{unit}</span>
                      )}
                    </div>
                    <div
                      className={`mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium ${
                        positive ? "text-leaf" : "text-ink-3"
                      }`}
                    >
                      {positive && <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />}
                      {note}
                    </div>
                  </div>
                ))}
              </div>

              {/* Commitments */}
              <div className="overflow-hidden rounded-xl border border-hairline bg-white shadow-[0_1px_1px_rgba(27,35,32,0.03),0_1px_3px_rgba(27,35,32,0.04)]">
                <div className="flex flex-col gap-0.5 border-b border-hairline bg-paper-2/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <h3
                    className="text-[13px] font-semibold tracking-[-0.005em] text-ink"
                    style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
                  >
                    Recent Meeting Commitments{" "}
                    <span className="font-normal text-ink-3">(Live Stream)</span>
                  </h3>
                  <span className="text-xs text-ink-3">Product Sync • Today, 10:00 AM</span>
                </div>

                <ul className="divide-y divide-hairline">
                  {COMMITMENTS.map((item) => {
                    const done = !!completedItems[item.id];
                    return (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-4 p-4 transition-colors duration-150 hover:bg-paper/70"
                      >
                        <div className="flex min-w-0 items-start gap-3.5">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={done}
                            aria-label={`Mark "${item.title}" as complete`}
                            onClick={() => toggleItem(item.id)}
                            className={`mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-all duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf active:scale-90 ${
                              done
                                ? "border-leaf bg-leaf text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(31,132,79,0.35)]"
                                : "border-ink/20 bg-white shadow-[inset_0_1px_1px_rgba(27,35,32,0.05)] hover:border-leaf"
                            }`}
                          >
                            <Check
                              className={`h-3.5 w-3.5 transition-all duration-150 ease-out ${
                                done ? "scale-100 opacity-100" : "scale-50 opacity-0"
                              }`}
                              strokeWidth={3}
                            />
                          </button>
                          <div className="min-w-0">
                            <p
                              className={`text-sm font-medium leading-snug tracking-[-0.005em] transition-colors duration-200 ${
                                done
                                  ? "text-ink-3 line-through decoration-ink-3/50"
                                  : "text-ink"
                              }`}
                            >
                              {item.title}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-ink-3">
                              <span className="font-medium text-ink-2">
                                Assignee: {item.assignee}
                              </span>
                              <span aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-ink/25" />
                              <span
                                className={
                                  item.dueUrgent
                                    ? "rounded-md bg-leaf-tint px-2 py-0.5 font-medium text-leaf"
                                    : ""
                                }
                              >
                                Due: {item.due}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span
                          className={`mt-px inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            item.statusTone === "brand"
                              ? "bg-leaf-tint text-leaf"
                              : "bg-paper-2 text-ink-2"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              item.statusTone === "brand" ? "bg-leaf" : "bg-ink-3"
                            }`}
                          />
                          {item.status}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
