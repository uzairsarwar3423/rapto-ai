"use client";

import { motion } from "framer-motion";
import { Users } from "lucide-react";

export function AboutHero() {
  return (
    <section className="relative w-full pt-32 pb-24 overflow-hidden border-b border-border bg-surface-2">
      {/* Background decoration */}
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
          <Users className="w-4 h-4 text-brand" />
          <span className="text-sm font-medium text-foreground">
            Our Story
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="text-display leading-tight text-foreground mb-6 font-sans font-bold tracking-tight"
          style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}
        >
          We believe <span className="text-brand">great meetings</span> lead to great work.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
          className="text-lg md:text-xl text-muted leading-relaxed font-sans max-w-2xl mx-auto"
        >
          Rapto was born out of frustration with endless catch-ups and dropped commitments. 
          We're on a mission to give remote teams their time back, ensuring every promise made 
          is a promise kept.
        </motion.p>
      </div>
    </section>
  );
}
