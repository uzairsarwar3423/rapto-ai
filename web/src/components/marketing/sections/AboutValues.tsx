"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Zap, HeartHandshake, Eye } from "lucide-react";

const values = [
  {
    id: "accountability",
    title: "Accountability first",
    description: "We build tools that foster trust through transparency. When people know what's expected of them, teams thrive.",
    icon: ShieldCheck,
  },
  {
    id: "speed",
    title: "Respect for time",
    description: "Time is the most valuable asset a remote team has. We design every feature to save time, not consume it.",
    icon: Zap,
  },
  {
    id: "empathy",
    title: "Built with empathy",
    description: "We understand the challenges of remote work. Our solutions are designed to support humans, not just track metrics.",
    icon: HeartHandshake,
  },
  {
    id: "transparency",
    title: "Radical transparency",
    description: "No hidden agendas, no silent failures. We surface what matters so teams can make informed decisions together.",
    icon: Eye,
  },
];

export function AboutValues() {
  return (
    <section className="py-24 bg-background">
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
            Our Core Values
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-muted font-sans max-w-2xl mx-auto"
          >
            These are the principles that guide our product decisions, our culture, and how we interact with our customers.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {values.map((value, index) => (
            <motion.div
              key={value.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="p-8 rounded-2xl bg-surface-2 border border-border hover:shadow-md transition-shadow duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center mb-6">
                <value.icon className="w-6 h-6 text-brand" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3 font-sans">
                {value.title}
              </h3>
              <p className="text-muted leading-relaxed font-sans">
                {value.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
