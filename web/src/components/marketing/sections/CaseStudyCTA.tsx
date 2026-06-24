"use client";

import { motion } from "framer-motion";
import { ArrowRight, BarChart } from "lucide-react";
import { MarketingButton } from "../ui/MarketingButton";

export function CaseStudyCTA() {
  return (
    <section className="py-24 bg-surface-2 border-t border-border relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-brand/10 rounded-full blur-[100px] pointer-events-none translate-x-1/3 translate-y-1/3" />
      
      <div className="container mx-auto px-6 max-w-4xl text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="bg-brand text-white rounded-3xl p-10 md:p-16 shadow-2xl relative overflow-hidden"
        >
          {/* Inner subtle glow */}
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />

          <div className="mx-auto w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 border border-white/20">
            <BarChart className="w-8 h-8 text-white" />
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold mb-4 font-sans tracking-tight"
              style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}>
            Ready to get these results for your team?
          </h2>
          
          <p className="text-lg text-brand-subtle mb-8 max-w-xl mx-auto font-sans">
            Stop chasing status updates. Let Vocaply handle the follow-ups so your engineering 
            team can focus on shipping.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <MarketingButton variant="outline" size="lg" className="bg-white text-brand border-white hover:bg-brand-subtle hover:text-brand" href="#waitlist">
              Start Your Free Trial
              <ArrowRight className="w-4 h-4 ml-2" />
            </MarketingButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
