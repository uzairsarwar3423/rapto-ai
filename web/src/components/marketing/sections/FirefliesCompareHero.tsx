"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { MarketingButton } from "../ui/MarketingButton";

export function FirefliesCompareHero() {
  return (
    <section className="relative w-full pt-32 pb-20 overflow-hidden border-b border-border bg-surface-2">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand/10 blur-[120px] rounded-full opacity-50" />
      </div>

      <div className="container relative mx-auto px-6 max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-border shadow-sm mb-8"
        >
          <Sparkles className="w-4 h-4 text-brand" />
          <span className="text-sm font-medium text-foreground">
            Vocaply vs Fireflies.ai
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="text-display leading-tight text-foreground mb-6 font-bold tracking-tight"
          style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}
        >
          Beyond generic meeting notes. <br />
          <span className="text-brand">Real engineering accountability.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
          className="text-lg md:text-xl text-muted leading-relaxed font-sans max-w-2xl mx-auto mb-10"
        >
          Fireflies is a great general-purpose AI note-taker. But engineering teams need more 
          than just a summary. Vocaply actively manages commitments, syncs directly to Jira, 
          and handles follow-ups autonomously.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <MarketingButton variant="primary" size="lg" href="#waitlist">
            Try Vocaply for Free
            <ArrowRight className="w-4 h-4 ml-2" />
          </MarketingButton>
          <MarketingButton variant="outline" size="lg" href="#comparison">
            See the Comparison
          </MarketingButton>
        </motion.div>
      </div>
    </section>
  );
}
