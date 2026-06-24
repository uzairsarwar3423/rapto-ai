"use client";

/**
 * SecuritySection.tsx
 * Day 8 — 4 security claim cards (2×2) + compliance badges row.
 * White bg. Lucide icons in green squares.
 */

import { motion } from "framer-motion";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { containerVariant, fadeUpVariant } from "@/lib/marketing/animations";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { SecurityCard } from "@/components/marketing/ui/SecurityCard";
import {
  securityClaims,
  complianceBadges,
} from "@/lib/marketing/content/security.content";

const cardContainerVariant = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function SecuritySection() {
  const [ref, isVisible] = useScrollReveal(0.08);

  return (
    <section
      ref={ref}
      aria-label="Security and privacy"
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
          style={{ marginBottom: "52px" }}
        >
          <motion.div variants={fadeUpVariant}>
            <SectionLabel>Security &amp; privacy</SectionLabel>
          </motion.div>
          <motion.div variants={fadeUpVariant} style={{ maxWidth: "560px" }}>
            <SectionHeading>
              {"Your meetings are private. |We keep them that way.|"}
            </SectionHeading>
          </motion.div>
        </motion.div>

        {/* 2×2 card grid */}
        <motion.div
          variants={cardContainerVariant}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "20px",
            marginBottom: "32px",
          }}
          className="security-grid"
        >
          {securityClaims.map((claim) => (
            <motion.div key={claim.title} variants={cardVariant}>
              <SecurityCard claim={claim} />
            </motion.div>
          ))}
        </motion.div>

        {/* Compliance badges */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
        >
          {complianceBadges.map((badge) => (
            <span
              key={badge.label}
              style={{
                fontFamily: "monospace",
                fontSize: "11px",
                fontWeight: 600,
                padding: "5px 12px",
                borderRadius: "4px",
                background: badge.muted ? "#F2F1EE" : "#E8F5EE",
                color: badge.muted ? "#9B9A96" : "#1A6B3C",
              }}
            >
              {badge.label}
            </span>
          ))}
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 600px) {
          .security-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
