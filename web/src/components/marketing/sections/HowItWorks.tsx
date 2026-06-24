"use client";

/**
 * HowItWorks.tsx
 * Three-step guide explaining the core product mechanics.
 * Staggers animations on reveal using useScrollReveal.
 */

import { motion } from "framer-motion";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { StepCard } from "@/components/marketing/ui/StepCard";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { containerVariant } from "@/lib/marketing/animations";
import {
  howItWorksHeaderLabel,
  howItWorksHeadline,
  howItWorksSubheadline,
  steps,
} from "@/lib/marketing/content/how-it-works.content";

export function HowItWorks() {
  const [sectionRef, isVisible] = useScrollReveal(0.12);

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      aria-label="How it works"
      style={{
        background: "#FFFFFF",
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
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <SectionLabel>{howItWorksHeaderLabel}</SectionLabel>
        </div>

        <h2
          style={{
            fontFamily: "var(--font-serif, Georgia, serif)",
            fontSize: "clamp(28px, 4.2vw, 48px)",
            lineHeight: 1.1,
            letterSpacing: "-1.0px",
            color: "#0A0A0A",
            textAlign: "center",
            marginBottom: "16px",
            maxWidth: "600px",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {howItWorksHeadline}
        </h2>

        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "clamp(15px, 1.8vw, 17px)",
            fontWeight: 300,
            color: "#6B6A67",
            lineHeight: 1.65,
            maxWidth: "520px",
            textAlign: "center",
            marginBottom: "52px",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {howItWorksSubheadline}
        </p>

        {/* ── Steps Grid ────────────────────────────────────── */}
        <motion.div
          variants={containerVariant}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          className="steps-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "2px",
            background: "#E4E3DF", // Gap acting as a grid separator line
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid #E4E3DF",
          }}
        >
          {steps.map((step) => (
            <StepCard
              key={step.number}
              number={step.number}
              iconName={step.iconName}
              title={step.title}
              description={step.description}
            />
          ))}
        </motion.div>
      </div>

      <style>{`
        /* Mobile collapses steps to vertical list */
        @media (max-width: 768px) {
          .steps-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
            background: transparent !important;
            border: none !important;
          }

          .steps-grid > div {
            border-radius: 10px !important;
            border: 1px solid #E4E3DF !important;
          }
        }
      `}</style>
    </section>
  );
}
