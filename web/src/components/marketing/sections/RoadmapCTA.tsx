"use client";

import { motion } from "framer-motion";
import { Lightbulb, ArrowRight } from "lucide-react";
import { MarketingButton } from "../ui/MarketingButton";

export function RoadmapCTA() {
  return (
    <section className="py-24 bg-surface-2 border-t border-border relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand/5 rounded-full blur-[80px] pointer-events-none" />
      
      <div className="container mx-auto px-6 max-w-4xl text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="bg-white dark:bg-background border border-border rounded-2xl p-10 md:p-16 shadow-lg"
        >
          <div className="mx-auto w-16 h-16 bg-brand-subtle rounded-2xl flex items-center justify-center mb-6">
            <Lightbulb className="w-8 h-8 text-brand" />
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 font-sans tracking-tight"
              style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}>
            Have a feature request?
          </h2>
          
          <p className="text-lg text-muted mb-8 max-w-xl mx-auto font-sans">
            We build Rapto based on the feedback of our users. If there's something 
            you'd love to see, let our product team know.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <MarketingButton variant="primary" size="lg" href="/contact">
              Submit Request
              <ArrowRight className="w-4 h-4 ml-2" />
            </MarketingButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
