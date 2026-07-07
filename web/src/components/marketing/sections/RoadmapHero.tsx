"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { MarketingButton } from "../ui/MarketingButton";

export function RoadmapHero() {
  return (
    <section className="relative w-full pt-32 pb-20 overflow-hidden border-b border-border bg-surface-2">
      {/* Background gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] h-[400px] opacity-30 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-subtle via-transparent to-brand-subtle blur-[100px]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-brand/20 blur-[120px] rounded-full" />
      </div>

      <div className="container relative mx-auto px-6 max-w-5xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-border shadow-sm mb-8"
        >
          <Sparkles className="w-4 h-4 text-brand" />
          <span className="text-sm font-medium text-foreground">
            Building the future of accountability
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="text-display leading-tight text-foreground mb-6 font-sans font-bold tracking-tight"
          style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}
        >
          See what we're <span className="text-brand">building next.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
          className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10 font-sans"
        >
          We're constantly evolving Rapto to make your remote team more productive. 
          Check out our latest releases, what's currently in progress, and what we have planned.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <MarketingButton variant="primary" size="lg" href="#roadmap-board">
            View Roadmap
            <ArrowRight className="w-4 h-4 ml-2" />
          </MarketingButton>
          <MarketingButton variant="outline" size="lg" href="/contact">
            Request a Feature
          </MarketingButton>
        </motion.div>
      </div>
    </section>
  );
}
