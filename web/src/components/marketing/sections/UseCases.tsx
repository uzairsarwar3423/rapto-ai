"use client";

/**
 * UseCases.tsx
 * Day 7 — 2×2 grid of use-case tiles on a gray-1 background.
 * Staggered reveal. Full responsive collapse to 1-col mobile.
 */

import { motion } from "framer-motion";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { containerVariant, fadeUpVariant } from "@/lib/marketing/animations";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { UseCaseTile } from "@/components/marketing/ui/UseCaseTile";
import { useCaseTiles } from "@/lib/marketing/content/usecases.content";

const gridContainerVariant = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.13, delayChildren: 0.15 } },
};

const tileVariant = {
  hidden: { opacity: 0, scale: 0.97, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function UseCases() {
  const [ref, isVisible] = useScrollReveal(0.08);

  return (
    <section
      ref={ref}
      aria-label="Use cases"
      style={{
        background: "#F2F1EE",
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
            <SectionLabel>Use cases</SectionLabel>
          </motion.div>

          <motion.div variants={fadeUpVariant} style={{ maxWidth: "560px" }}>
            <SectionHeading>
              {"Works in every meeting — |every single one.|"}
            </SectionHeading>
          </motion.div>

          <motion.p
            variants={fadeUpVariant}
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "clamp(15px, 1.6vw, 17px)",
              fontWeight: 300,
              color: "#6B6A67",
              lineHeight: 1.65,
              maxWidth: "480px",
              marginTop: "16px",
            }}
          >
            Whether it&apos;s a 10-person standup or a 200-person all-hands,
            Vocaply extracts and tracks what was promised.
          </motion.p>
        </motion.div>

        {/* 2×2 grid */}
        <motion.div
          variants={gridContainerVariant}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "20px",
          }}
          className="usecases-grid"
        >
          {useCaseTiles.map((tile) => (
            <motion.div key={tile.title} variants={tileVariant}>
              <UseCaseTile data={tile} />
            </motion.div>
          ))}
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .usecases-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
