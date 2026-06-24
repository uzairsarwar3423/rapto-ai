"use client";

import { motion } from "framer-motion";
import { Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    category: "Meeting Data",
    items: [
      { name: "Full Meeting Transcription", vocaply: true, otter: true },
      { name: "Speaker Identification", vocaply: true, otter: true },
      { name: "Audio Playback", vocaply: true, otter: true },
    ]
  },
  {
    category: "Actionability & Engineering",
    items: [
      { name: "Automated Commitment Extraction", vocaply: true, otter: "partial" },
      { name: "Native Jira Two-Way Sync", vocaply: true, otter: false },
      { name: "Slack Deadline Nudges", vocaply: true, otter: false },
      { name: "Standup Specific AI Tuning", vocaply: true, otter: false },
    ]
  },
  {
    category: "Workflow & Automation",
    items: [
      { name: "Automated Follow-ups", vocaply: true, otter: false },
      { name: "Commitment Status Tracking", vocaply: true, otter: false },
      { name: "Team Accountability Dashboard", vocaply: true, otter: false },
    ]
  }
];

export function CompareTable() {
  const renderIcon = (status: boolean | string) => {
    if (status === true) {
      return <Check className="w-5 h-5 text-brand mx-auto" />;
    } else if (status === false) {
      return <X className="w-5 h-5 text-muted-subtle mx-auto" />;
    } else {
      return <Minus className="w-5 h-5 text-amber-500 mx-auto" />;
    }
  };

  return (
    <section id="comparison" className="py-24 bg-background">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight"
            style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}
          >
            Feature Comparison
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-muted font-sans max-w-2xl mx-auto"
          >
            See exactly how Vocaply's engineering-focused accountability stacks up against Otter's general transcription.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="overflow-x-auto"
        >
          <div className="min-w-[700px] bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
            {/* Table Header */}
            <div className="grid grid-cols-3 border-b border-border bg-surface-2 p-4">
              <div className="col-span-1"></div>
              <div className="col-span-1 text-center">
                <div className="inline-block px-4 py-1.5 bg-brand text-white rounded-full text-sm font-bold font-sans tracking-wide">
                  Vocaply
                </div>
              </div>
              <div className="col-span-1 text-center">
                <div className="inline-block px-4 py-1.5 bg-surface text-muted border border-border rounded-full text-sm font-bold font-sans tracking-wide">
                  Otter.ai
                </div>
              </div>
            </div>

            {/* Table Body */}
            <div className="flex flex-col">
              {features.map((section, sIdx) => (
                <div key={section.category}>
                  <div className="bg-surface-2/50 px-6 py-3 border-y border-border/50">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider font-sans">
                      {section.category}
                    </h3>
                  </div>
                  {section.items.map((item, iIdx) => (
                    <div 
                      key={item.name} 
                      className={cn(
                        "grid grid-cols-3 px-6 py-4 transition-colors hover:bg-surface-2/30",
                        iIdx !== section.items.length - 1 && "border-b border-border/50"
                      )}
                    >
                      <div className="col-span-1 flex items-center">
                        <span className="text-base text-foreground font-medium font-sans">
                          {item.name}
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        {renderIcon(item.vocaply)}
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        {renderIcon(item.otter)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
