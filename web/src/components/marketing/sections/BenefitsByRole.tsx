"use client";

/**
 * BenefitsByRole.tsx
 * Day 7 — 3-column card grid, one per persona.
 * White bg. Scroll-stagger reveal.
 */

import { motion } from "framer-motion";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { containerVariant, fadeUpVariant } from "@/lib/marketing/animations";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { RoleCard } from "@/components/marketing/ui/RoleCard";
import { roleCards } from "@/lib/marketing/content/benefits.content";

const cardContainerVariant = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function BenefitsByRole() {
  const [ref, isVisible] = useScrollReveal(0.08);

  return (
    <section
      ref={ref}
      aria-label="Benefits by role"
      style={{
        background: "white",
        padding: "clamp(64px, 9vw, 108px) var(--pad, clamp(20px, 5vw, 80px))",
      }}
    >
      <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
        {/* Header */}
        <motion.div
          variants={containerVariant}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          style={{ marginBottom: "56px" }}
        >
          <motion.div variants={fadeUpVariant}>
            <SectionLabel>Benefits by role</SectionLabel>
          </motion.div>

          <motion.div variants={fadeUpVariant} style={{ maxWidth: "560px" }}>
            <SectionHeading>
              {"Built for the people |stuck in standups.|"}
            </SectionHeading>
          </motion.div>
        </motion.div>

        {/* 3-column card grid */}
        <motion.div
          variants={cardContainerVariant}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "20px",
          }}
          className="roles-grid"
        >
          {roleCards.map((card) => (
            <motion.div
              key={card.roleLabel}
              variants={cardVariant}
              style={{ height: "100%" }}
            >
              <RoleCard data={card} />
            </motion.div>
          ))}
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .roles-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 580px) {
          .roles-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
