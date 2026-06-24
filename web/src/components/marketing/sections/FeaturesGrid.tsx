"use client";

/**
 * FeaturesGrid.tsx
 * Six feature cards in a 2x3 layout showcasing platform capabilities.
 * Stagger animates on scroll reveal using useScrollReveal.
 */

import { motion } from "framer-motion";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { FeatureCard } from "@/components/marketing/ui/FeatureCard";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { containerVariant } from "@/lib/marketing/animations";
import { features } from "@/lib/marketing/content/features.content";

interface FeaturesGridProps {
  id?: string;
}

export function FeaturesGrid({ id = "features" }: FeaturesGridProps) {
  const [sectionRef, isVisible] = useScrollReveal(0.1);

  return (
    <section
      id={id}
      ref={sectionRef}
      aria-label="Features grid"
      style={{
        background: "#FAFAF8",
        paddingTop: "clamp(60px, 8vw, 100px)",
        paddingBottom: "clamp(60px, 8vw, 100px)",
        paddingLeft: "var(--pad)",
        paddingRight: "var(--pad)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* ── Section header ─────────────────────────────────── */}
        <div style={{ marginBottom: "8px" }}>
          <SectionLabel>Features</SectionLabel>
        </div>

        <div style={{ marginBottom: "56px", maxWidth: "600px" }}>
          <SectionHeading>
            Built for how remote teams |actually work.|
          </SectionHeading>
        </div>

        {/* ── Features Grid ─────────────────────────────────── */}
        <motion.div
          variants={containerVariant}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          className="features-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "24px",
          }}
        >
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              iconName={feature.iconName}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </motion.div>
      </div>

      <style>{`
        /* Mobile Breakpoint */
        @media (max-width: 768px) {
          .features-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
        }
      `}</style>
    </section>
  );
}
