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
} from "lucide-react";
import { NavLogo } from "@/components/ui/NavLogo";

export function LandingHero() {
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
                app.rapto.cloud / workspace / commitments
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#48524E] font-medium bg-white px-2.5 py-1 rounded border border-[#B2B9B6]/40 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-[#1F844F] animate-pulse" />
              <span>Live Sync Active</span>
            </div>
          </div>

          {/* SaaS Interface Dashboard Body */}
          <div className="p-6 sm:p-8 space-y-6 bg-white">
            {/* Top Grid: Meeting Summary + Team Progress */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Meeting Summary Card */}
              <div className="lg:col-span-2 rounded-lg bg-[#F3F2ED]/60 border border-[#B2B9B6]/40 p-5 flex flex-col justify-between space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#48524E] uppercase tracking-wider mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-[#1F844F]" />
                      <span>Latest Meeting Intelligence</span>
                    </div>
                    <h3 className="text-base font-semibold text-[#1B2320]">
                      Q3 Product Architecture & Deliverables Sync
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-[#E1F4E9] text-[#1F844F] border border-[#1F844F]/20">
                    <CheckCircle2 className="w-3 h-3" />
                    Processed
                  </span>
                </div>

                <p className="text-xs text-[#48524E] leading-relaxed bg-white p-3 rounded-md border border-[#B2B9B6]/40">
                  <strong className="font-semibold text-[#1B2320]">Executive Summary:</strong> Team finalized API contract v2 migration by Friday. Engineering leads committed to completing OAuth refresh token handlers and deployment audit.
                </p>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#77827E] pt-1 border-t border-[#B2B9B6]/30">
                  <div className="flex items-center gap-4 text-[#48524E]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> 45 mins
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> 6 Attendees
                    </span>
                  </div>
                  <span className="font-medium text-[#1B2320]">5 Action Items Extracted</span>
                </div>
              </div>

              {/* Team Progress Card */}
              <div className="rounded-lg bg-[#F3F2ED]/60 border border-[#B2B9B6]/40 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#48524E] uppercase tracking-wider">
                      Team Reliability
                    </span>
                    <span className="text-xs font-semibold text-[#1F844F] flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> +4.2%
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-[#1B2320] tracking-tight font-display">96%</div>
                  <p className="text-xs text-[#48524E] mt-1">18 Commitments Fulfilled · 0 Overdue</p>
                </div>

                <div className="space-y-2 mt-6">
                  <div className="w-full bg-[#B2B9B6]/40 rounded-full h-2 overflow-hidden">
                    <div className="bg-[#1F844F] h-2 rounded-full w-[96%]" />
                  </div>
                  <div className="flex justify-between text-[11px] font-medium text-[#48524E]">
                    <span>On-time Rate</span>
                    <span className="text-[#1B2320] font-semibold">96.4%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Items & Commitments Table */}
            <div className="rounded-lg border border-[#B2B9B6]/40 bg-white overflow-hidden">
              <div className="px-5 py-3.5 bg-[#F3F2ED]/80 border-b border-[#B2B9B6]/40 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#1B2320] tracking-tight uppercase">
                  Action Items & Deliverables
                </span>
                <span className="text-xs text-[#77827E] font-mono">Real-time sync</span>
              </div>

              <div className="divide-y divide-[#B2B9B6]/30">
                {/* Item 1 */}
                <div
                  onClick={() => toggleItem("item-1")}
                  className="p-4 sm:px-5 flex items-center justify-between gap-4 hover:bg-[#F3F2ED]/40 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <button
                      type="button"
                      aria-label="Toggle commitment status"
                      className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                        completedItems["item-1"]
                          ? "bg-[#1F844F] text-white"
                          : "border border-[#77827E] text-transparent hover:border-[#1B2320]"
                      }`}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </button>
                    <span
                      className={`text-xs sm:text-sm font-medium min-w-0 truncate ${
                        completedItems["item-1"]
                          ? "line-through text-[#77827E]"
                          : "text-[#1B2320]"
                      }`}
                    >
                      Finalize OAuth 2.0 PKCE refresh token handler
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#F3F2ED] text-[#1B2320] border border-[#B2B9B6]/40">
                      Uzair S.
                    </span>
                    <span className="text-xs font-medium text-[#48524E]">Today</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                        completedItems["item-1"]
                          ? "bg-[#E1F4E9] text-[#1F844F] border-[#1F844F]/20"
                          : "bg-amber-50 text-amber-700 border-amber-200/60"
                      }`}
                    >
                      {completedItems["item-1"] ? "Fulfilled" : "In Progress"}
                    </span>
                  </div>
                </div>

                {/* Item 2 */}
                <div
                  onClick={() => toggleItem("item-2")}
                  className="p-4 sm:px-5 flex items-center justify-between gap-4 hover:bg-[#F3F2ED]/40 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <button
                      type="button"
                      aria-label="Toggle commitment status"
                      className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                        completedItems["item-2"]
                          ? "bg-[#1F844F] text-white"
                          : "border border-[#77827E] text-transparent hover:border-[#1B2320]"
                      }`}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </button>
                    <span
                      className={`text-xs sm:text-sm font-medium min-w-0 truncate ${
                        completedItems["item-2"]
                          ? "line-through text-[#77827E]"
                          : "text-[#1B2320]"
                      }`}
                    >
                      Implement brand logo system across email templates
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#F3F2ED] text-[#1B2320] border border-[#B2B9B6]/40">
                      Sarah M.
                    </span>
                    <span className="text-xs font-medium text-[#48524E]">Today</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                        completedItems["item-2"]
                          ? "bg-[#E1F4E9] text-[#1F844F] border-[#1F844F]/20"
                          : "bg-amber-50 text-amber-700 border-amber-200/60"
                      }`}
                    >
                      {completedItems["item-2"] ? "Fulfilled" : "In Progress"}
                    </span>
                  </div>
                </div>

                {/* Item 3 */}
                <div
                  onClick={() => toggleItem("item-3")}
                  className="p-4 sm:px-5 flex items-center justify-between gap-4 hover:bg-[#F3F2ED]/40 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <button
                      type="button"
                      aria-label="Toggle commitment status"
                      className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                        completedItems["item-3"]
                          ? "bg-[#1F844F] text-white"
                          : "border border-[#77827E] text-transparent hover:border-[#1B2320]"
                      }`}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </button>
                    <span
                      className={`text-xs sm:text-sm font-medium min-w-0 truncate ${
                        completedItems["item-3"]
                          ? "line-through text-[#77827E]"
                          : "text-[#1B2320]"
                      }`}
                    >
                      Deploy Redis cluster for BullMQ notification queue
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#F3F2ED] text-[#1B2320] border border-[#B2B9B6]/40">
                      Alex R.
                    </span>
                    <span className="text-xs font-medium text-[#48524E]">Tomorrow</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                        completedItems["item-3"]
                          ? "bg-[#E1F4E9] text-[#1F844F] border-[#1F844F]/20"
                          : "bg-[#F3F2ED] text-[#48524E] border-[#B2B9B6]/40"
                      }`}
                    >
                      {completedItems["item-3"] ? "Fulfilled" : "Scheduled"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full border-t border-[#B2B9B6]/40 mt-auto py-8 bg-[#FAF9F5] z-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs font-mono text-[#77827E]">
            © 2026 Rapto AI
          </span>

          <div className="flex items-center gap-6 text-xs font-medium text-[#48524E]">
            <Link href="/privacy" className="hover:text-[#1B2320] transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-[#1B2320] transition-colors">
              Terms of Service
            </Link>
            <Link href="/refund" className="hover:text-[#1B2320] transition-colors">
              Refund Policy
            </Link>
            <Link href="/contact" className="hover:text-[#1B2320] transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
