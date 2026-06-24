"use client";

import { motion } from "framer-motion";
import { ListChecks, Repeat, Database } from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    title: "Accountability vs Playback",
    description: "Fathom is amazing for re-watching a great sales pitch or sharing a product demo clip. But in engineering, no one wants to re-watch a standup. They just want to know what tasks were committed to. Vocaply skips the video and jumps straight to the tickets.",
    icon: ListChecks,
    align: "left",
  },
  {
    title: "Closing the Loop",
    description: "Fathom sends you a summary after the call. Vocaply actively manages the commitments made during the call, following up with engineers on Slack days later if a task isn't marked complete in Jira.",
    icon: Repeat,
    align: "right",
  },
  {
    title: "Built for Engineering Stacks",
    description: "While Fathom integrates with HubSpot and Salesforce, Vocaply integrates deeply with Jira, Linear, and GitHub. It speaks your engineering team's language.",
    icon: Database,
    align: "left",
  },
];

export function FathomCompareFeatures() {
  return (
    <section className="py-24 bg-surface-2 border-t border-border">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-20">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight"
            style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}
          >
            Why Engineering Teams Choose Vocaply
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-muted font-sans max-w-2xl mx-auto"
          >
            Stop settling for passive meeting summaries. Move to an active accountability platform.
          </motion.p>
        </div>

        <div className="flex flex-col gap-16 md:gap-24">
          {features.map((feature, index) => (
            <div 
              key={feature.title} 
              className={cn(
                "flex flex-col gap-8 md:gap-16 items-center",
                feature.align === "left" ? "md:flex-row" : "md:flex-row-reverse"
              )}
            >
              {/* Text Content */}
              <motion.div
                initial={{ opacity: 0, x: feature.align === "left" ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="flex-1"
              >
                <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center mb-6">
                  <feature.icon className="w-6 h-6 text-brand" />
                </div>
                <h3 
                  className="text-2xl md:text-3xl font-bold text-foreground mb-4 font-sans tracking-tight"
                  style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}
                >
                  {feature.title}
                </h3>
                <p className="text-lg text-muted leading-relaxed font-sans">
                  {feature.description}
                </p>
              </motion.div>

              {/* Visual Placeholder */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="flex-1 w-full"
              >
                <div className="aspect-[4/3] rounded-2xl bg-white border border-border shadow-md flex items-center justify-center overflow-hidden relative">
                  <div className="absolute inset-0 bg-grid-black/[0.02] bg-[size:20px_20px]" />
                  <div className="relative z-10 w-2/3 h-2/3 border border-border rounded-xl bg-surface-2/50 backdrop-blur-sm flex items-center justify-center">
                    <span className="text-muted-subtle font-medium font-sans">UI Visual</span>
                  </div>
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
