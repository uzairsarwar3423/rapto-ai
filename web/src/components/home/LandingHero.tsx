"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  Users,
  TrendingUp,
  Check,
  LayoutDashboard,
} from "lucide-react";
import { NavLogo } from "@/components/ui/NavLogo";
import { useAuth } from "@/features/auth/hooks/useAuth";

export function LandingHero() {
  const { isAuthenticated, user, isLoading } = useAuth();
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({
    "item-2": true,
  });

  const toggleItem = (id: string) => {
    setCompletedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F5] text-[#1B2320] selection:bg-[#E1F4E9] selection:text-[#1F844F] font-sans relative overflow-hidden">
      {/* Subtle ambient lighting using Rapto brand green tint */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[450px] pointer-events-none opacity-60 blur-[120px]"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, rgba(225, 244, 233, 0.95) 0%, rgba(250, 249, 245, 0) 75%)",
        }}
      />

      {/* Almost Invisible Elegant Navigation */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-[#FAF9F5]/85 border-b border-[#B2B9B6]/30 transition-all">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <NavLogo
            href="/"
            className="font-display text-xl font-bold tracking-tight text-[#1B2320] flex items-center transition-opacity hover:opacity-85"
          />

          <div className="flex items-center gap-6">
            {!isLoading && isAuthenticated && user ? (
              <Link
                href="/dashboard"
                className="text-sm font-medium text-[#FAF9F5] bg-[#1F844F] hover:bg-[#196b40] px-4.5 py-2 rounded-md shadow-2xs transition-all duration-150 active:scale-[0.98] border border-[#1F844F] inline-flex items-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-[#48524E] hover:text-[#1B2320] transition-colors duration-150"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-medium text-[#FAF9F5] bg-[#1B2320] hover:bg-[#1F844F] px-4.5 py-2 rounded-md shadow-2xs transition-all duration-150 active:scale-[0.98] border border-[#1B2320]"
                >
                  Start Free Trial
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-start pt-16 sm:pt-24 pb-20 px-4 sm:px-6 relative z-10 max-w-6xl mx-auto w-full text-center">
        {/* Small Section Label */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E1F4E9] border border-[#1F844F]/20 text-[11px] font-semibold text-[#1F844F] uppercase tracking-[0.1em] mb-8 select-none"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#1F844F] animate-pulse" />
          AI Meeting Accountability
        </motion.div>

        {/* Headline — Space Grotesk Display Font */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-[clamp(40px,5.5vw,72px)] font-display font-bold tracking-tight text-[#1B2320] leading-[1.08] max-w-4xl mx-auto"
        >
          Never lose track of what your team commits to.
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-lg sm:text-xl text-[#48524E] max-w-2xl mt-6 leading-[1.65] font-sans font-normal"
        >
          Rapto AI remembers every commitment made in your meetings and follows up automatically — turning verbal promises into accountable deliverables.
        </motion.p>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10 w-full sm:w-auto"
        >
          {!isLoading && isAuthenticated && user ? (
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-base font-medium text-[#FAF9F5] bg-[#1F844F] hover:bg-[#196b40] border border-[#1F844F] px-8 py-3.5 rounded-md shadow-md transition-all duration-200 active:scale-[0.98] group cursor-pointer"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-base font-medium text-[#FAF9F5] bg-[#1B2320] hover:bg-[#1F844F] border border-[#1B2320] px-7 py-3.5 rounded-md shadow-md transition-all duration-200 active:scale-[0.98] group cursor-pointer"
              >
                <span>Start Free Trial</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center text-base font-medium text-[#1B2320] hover:text-[#1B2320] bg-[#FAF9F5] hover:bg-[#F3F2ED] border border-[#B2B9B6]/40 px-7 py-3.5 rounded-md shadow-2xs transition-all duration-200 cursor-pointer"
              >
                Sign In
              </Link>
            </>
          )}
        </motion.div>

        {/* Floating Product Interface Preview */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full mt-16 sm:mt-20 text-left rounded-xl bg-[#FAF9F5] border border-[#B2B9B6]/40 shadow-[0_16px_48px_rgba(27,35,32,0.08)] overflow-hidden select-none"
        >
          {/* Top Window Frame Bar */}
          <div className="bg-[#F3F2ED] border-b border-[#B2B9B6]/40 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#77827E]/40" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#77827E]/40" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#77827E]/40" />
              <span className="ml-2 text-xs font-medium text-[#77827E] font-mono">
                app.rapto.cloud/dashboard
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#1F844F] font-medium bg-[#E1F4E9] px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F844F]" />
              Live Syncing Active
            </div>
          </div>

          {/* Interactive Mock Dashboard Preview Container */}
          <div className="p-6 sm:p-8 bg-[#FAF9F5] space-y-6">
            {/* Header Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-[#B2B9B6]/40 p-4 rounded-lg shadow-2xs">
                <div className="flex items-center justify-between text-xs text-[#77827E] font-medium mb-1">
                  <span>Commitments Met</span>
                  <TrendingUp className="w-4 h-4 text-[#1F844F]" />
                </div>
                <div className="text-2xl font-bold text-[#1B2320]">94.2%</div>
                <div className="text-[11px] text-[#1F844F] font-medium mt-1">
                  +12.4% vs last week
                </div>
              </div>

              <div className="bg-white border border-[#B2B9B6]/40 p-4 rounded-lg shadow-2xs">
                <div className="flex items-center justify-between text-xs text-[#77827E] font-medium mb-1">
                  <span>Active Follow-ups</span>
                  <Clock className="w-4 h-4 text-[#77827E]" />
                </div>
                <div className="text-2xl font-bold text-[#1B2320]">18 Items</div>
                <div className="text-[11px] text-[#77827E] font-medium mt-1">
                  3 due today
                </div>
              </div>

              <div className="bg-white border border-[#B2B9B6]/40 p-4 rounded-lg shadow-2xs">
                <div className="flex items-center justify-between text-xs text-[#77827E] font-medium mb-1">
                  <span>AI Accuracy Score</span>
                  <Sparkles className="w-4 h-4 text-[#1F844F]" />
                </div>
                <div className="text-2xl font-bold text-[#1B2320]">99.8%</div>
                <div className="text-[11px] text-[#1F844F] font-medium mt-1">
                  Zero hallucinations
                </div>
              </div>
            </div>

            {/* Simulated Live Tracked Commitments */}
            <div className="bg-white border border-[#B2B9B6]/40 rounded-lg overflow-hidden shadow-2xs">
              <div className="px-4 py-3 bg-[#F3F2ED]/60 border-b border-[#B2B9B6]/30 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#48524E]">
                  Recent Meeting Commitments (Live Stream)
                </h3>
                <span className="text-xs text-[#77827E]">Product Sync • Today, 10:00 AM</span>
              </div>

              <div className="divide-y divide-[#B2B9B6]/20">
                {/* Item 1 */}
                <div className="p-4 flex items-start justify-between gap-4 transition-colors hover:bg-[#FAF9F5]/60">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleItem("item-1")}
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-all ${
                        completedItems["item-1"]
                          ? "bg-[#1F844F] border-[#1F844F] text-white"
                          : "border-[#B2B9B6] hover:border-[#1F844F] bg-white"
                      }`}
                    >
                      {completedItems["item-1"] && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                    <div>
                      <p
                        className={`text-sm font-medium transition-all ${
                          completedItems["item-1"]
                            ? "line-through text-[#77827E]"
                            : "text-[#1B2320]"
                        }`}
                      >
                        Ship updated API rate limiter & CORS policy to production cluster
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-[#77827E]">
                        <span className="font-medium text-[#48524E]">Assignee: Uzair</span>
                        <span>•</span>
                        <span className="text-[#1F844F] font-medium bg-[#E1F4E9] px-2 py-0.5 rounded">
                          Due: Today 5:00 PM
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded bg-[#E1F4E9] text-[#1F844F] shrink-0">
                    Confirmed
                  </span>
                </div>

                {/* Item 2 */}
                <div className="p-4 flex items-start justify-between gap-4 transition-colors hover:bg-[#FAF9F5]/60">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleItem("item-2")}
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-all ${
                        completedItems["item-2"]
                          ? "bg-[#1F844F] border-[#1F844F] text-white"
                          : "border-[#B2B9B6] hover:border-[#1F844F] bg-white"
                      }`}
                    >
                      {completedItems["item-2"] && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                    <div>
                      <p
                        className={`text-sm font-medium transition-all ${
                          completedItems["item-2"]
                            ? "line-through text-[#77827E]"
                            : "text-[#1B2320]"
                        }`}
                      >
                        Review Q3 infrastructure roadmap with DevOps team
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-[#77827E]">
                        <span className="font-medium text-[#48524E]">Assignee: Sarah K.</span>
                        <span>•</span>
                        <span>Due: Tomorrow 2:00 PM</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded bg-[#F3F2ED] text-[#48524E] shrink-0">
                    In Progress
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
