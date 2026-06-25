"use client";

import React from "react";
import { motion } from "framer-motion";
import { Crown, ArrowRight } from "lucide-react";

interface PlanLimitBannerProps {
  onUpgradeClick: () => void;
}

export function PlanLimitBanner({ onUpgradeClick }: PlanLimitBannerProps) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0, scale: 0.96 }}
      animate={{ height: "auto", opacity: 1, scale: 1 }}
      exit={{ height: 0, opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden w-full mb-6"
    >
      <div className="relative overflow-hidden rounded-xl border border-amber-500/30 dark:border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-rose-500/10 p-4 shadow-sm">
        
        {/* Ambient glow backgrounds */}
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-rose-500/20 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between z-10">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-inner">
              <Crown className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Meeting Limit Reached
              </span>
              <span className="text-xs text-muted-foreground mt-0.5 leading-relaxed pr-2">
                You've hit the meeting limit on your Free plan. Upgrade your subscription to add more capacity.
              </span>
            </div>
          </div>
          
          <button
            type="button"
            onClick={onUpgradeClick}
            className="group relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-lg bg-foreground px-4 py-2 text-xs font-medium text-background transition-all hover:bg-foreground/90 hover:shadow-md hover:shadow-foreground/20 active:scale-95"
          >
            <span className="relative z-10 flex items-center gap-1.5">
              Upgrade Plan
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
