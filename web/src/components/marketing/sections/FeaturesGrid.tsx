"use client";

import { motion } from "framer-motion";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { FeatureCard } from "@/components/marketing/ui/FeatureCard";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { containerVariant } from "@/lib/marketing/animations";
import { features } from "@/lib/marketing/content/features.content";
import { cn } from "@/lib/utils";

interface FeaturesGridProps {
  id?: string;
}

const getSpanClass = (index: number) => {
  switch (index) {
    case 0: return "col-span-1 md:col-span-6 lg:col-span-4";
    case 1: return "col-span-1 md:col-span-6 lg:col-span-2";
    case 2: return "col-span-1 md:col-span-6 lg:col-span-2";
    case 3: return "col-span-1 md:col-span-6 lg:col-span-4";
    case 4: return "col-span-1 md:col-span-6 lg:col-span-3";
    case 5: return "col-span-1 md:col-span-6 lg:col-span-3";
    default: return "col-span-1 md:col-span-6 lg:col-span-2";
  }
};

export function FeaturesGrid({ id = "features" }: FeaturesGridProps) {
  const [sectionRef, isVisible] = useScrollReveal(0.1);

  return (
    <section
      id={id}
      ref={sectionRef}
      aria-label="Features grid"
      className="relative py-24 md:py-32 overflow-hidden bg-[#FAFAF8] dark:bg-black"
    >
      <div className="mx-auto w-full max-w-7xl px-6 md:px-10 relative z-10">
        {/* ── Section header ─────────────────────────────────── */}
        <div className="flex flex-col items-center text-center mb-16 md:mb-24">
          <div className="mb-6">
            <SectionLabel>Powerful Capabilities</SectionLabel>
          </div>
          <div className="max-w-4xl">
            <h2 className="text-[2.5rem] md:text-5xl lg:text-6xl font-semibold tracking-tight text-neutral-900 dark:text-white leading-[1.1]">
              Built for how remote teams <span className="text-neutral-400 dark:text-neutral-500">actually work.</span>
            </h2>
          </div>
        </div>

        {/* ── Bento Grid ─────────────────────────────────── */}
        <motion.div
          variants={containerVariant}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          className="grid grid-cols-1 md:grid-cols-6 gap-6 auto-rows-auto lg:auto-rows-[340px]"
        >
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              index={index}
              iconName={feature.iconName}
              title={feature.title}
              description={feature.description}
              className={getSpanClass(index)}
            />
          ))}
        </motion.div>
      </div>

      {/* Decorative Background Elements */}
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 opacity-20 dark:opacity-30 mix-blend-multiply dark:mix-blend-screen blur-[100px] bg-gradient-to-b from-brand-subtle to-transparent rounded-full" />
    </section>
  );
}
