"use client";

import { motion } from "framer-motion";
import * as Lucide from "lucide-react";
import { cardVariant } from "@/lib/marketing/animations";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  iconName: string;
  title: string;
  description: string;
  className?: string;
  index?: number;
}

export function FeatureCard({ iconName, title, description, className, index = 0 }: FeatureCardProps) {
  const IconComponent = (Lucide as any)[iconName];

  // Pick a subtle gradient for the icon based on index to make them colorful but professional
  const gradients = [
    "from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400",
    "from-blue-500/20 to-indigo-500/20 text-blue-600 dark:text-blue-400",
    "from-purple-500/20 to-pink-500/20 text-purple-600 dark:text-purple-400",
    "from-amber-500/20 to-orange-500/20 text-amber-600 dark:text-amber-400",
    "from-rose-500/20 to-red-500/20 text-rose-600 dark:text-rose-400",
    "from-cyan-500/20 to-blue-500/20 text-cyan-600 dark:text-cyan-400",
  ];
  const colorTheme = gradients[index % gradients.length];

  return (
    <motion.div
      variants={cardVariant}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-[2rem]",
        "bg-white dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800",
        "transition-all duration-500 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:hover:shadow-[0_8px_30px_rgb(255,255,255,0.03)]",
        "hover:-translate-y-1",
        className
      )}
    >
      {/* ── Hover Glow Background ──────────────────────────────── */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-neutral-100/80 to-transparent dark:from-neutral-800/40 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      
      {/* ── Top area: Content ──────────────────────────────────── */}
      <div className="relative z-10 flex flex-col p-8 md:p-10 h-full">
        <div className={cn(
          "mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm",
          colorTheme
        )}>
          {IconComponent && <IconComponent size={32} strokeWidth={1.5} />}
        </div>

        <div className="mt-auto">
          <h3 className="mb-3 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            {title}
          </h3>
          
          <p className="text-base text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-[90%]">
            {description}
          </p>
        </div>
      </div>

      {/* ── Decorative abstract shape in the corner ────────────── */}
      <div className="absolute -bottom-8 -right-8 z-0 opacity-0 transition-all duration-700 group-hover:opacity-100 group-hover:-translate-y-4 group-hover:-translate-x-4 pointer-events-none">
        {IconComponent && <IconComponent size={180} strokeWidth={0.5} className="text-neutral-100 dark:text-neutral-800/40" />}
      </div>
    </motion.div>
  );
}
