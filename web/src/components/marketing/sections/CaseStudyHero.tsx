"use client";

import { motion } from "framer-motion";
import { TrendingUp, Clock, Target } from "lucide-react";
import Image from "next/image";

export function CaseStudyHero() {
  return (
    <section className="relative w-full pt-32 pb-20 overflow-hidden border-b border-border bg-surface-2">
      <div className="container relative mx-auto px-6 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Left Column: Text */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-border shadow-sm mb-6">
              <span className="text-sm font-semibold text-brand">Case Study</span>
              <span className="text-muted-subtle mx-1">•</span>
              <span className="text-sm font-medium text-muted">TechCorp</span>
            </div>

            <h1
              className="text-4xl md:text-5xl leading-tight text-foreground mb-6 font-bold tracking-tight"
              style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}
            >
              How TechCorp reduced dropped commitments by <span className="text-brand">85%</span>.
            </h1>

            <p className="text-lg text-muted leading-relaxed font-sans mb-8">
              Discover how a fully remote engineering team of 200+ used Vocaply to regain 
              control over their standups, saving over 40 hours a week in follow-up management.
            </p>

            <div className="flex items-center gap-4">
              <div className="flex -space-x-3">
                <img src="https://i.pravatar.cc/100?img=1" alt="Avatar" className="w-10 h-10 rounded-full border-2 border-surface-2 object-cover" />
                <img src="https://i.pravatar.cc/100?img=2" alt="Avatar" className="w-10 h-10 rounded-full border-2 border-surface-2 object-cover" />
                <img src="https://i.pravatar.cc/100?img=3" alt="Avatar" className="w-10 h-10 rounded-full border-2 border-surface-2 object-cover" />
              </div>
              <p className="text-sm font-medium text-muted font-sans">
                Joined by 200+ team members
              </p>
            </div>
          </motion.div>

          {/* Right Column: Key Metrics */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div className="p-6 rounded-2xl bg-white border border-border shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5 text-brand" />
              </div>
              <p className="text-3xl font-bold text-foreground mb-1 font-sans">85%</p>
              <p className="text-sm text-muted font-sans">Reduction in dropped tasks</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-border shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-foreground mb-1 font-sans">40hrs</p>
              <p className="text-sm text-muted font-sans">Saved per week</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-border shadow-sm sm:col-span-2">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center mb-4">
                <Target className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-3xl font-bold text-foreground mb-1 font-sans">100%</p>
              <p className="text-sm text-muted font-sans">Adoption rate across all engineering squads within 14 days</p>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
