"use client";

/**
 * CustomerLogos.tsx
 * Day 7 — Compact logo trust bar. Gray-1 bg. No section heading.
 * Soft marquee-style fade on edges (CSS mask).
 *
 * Note: uses text-based "wordmark" placeholders styled as real logos
 * until actual SVG assets are provided.
 */

import { motion } from "framer-motion";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";

const companyNames = [
  { name: "TechFlow", emoji: "⚡" },
  { name: "Buildify", emoji: "🏗️" },
  { name: "RemoteStack", emoji: "🌐" },
  { name: "Launchpad", emoji: "🚀" },
  { name: "Meridian", emoji: "🧭" },
  { name: "Vertix", emoji: "📐" },
  { name: "Praxo", emoji: "⚙️" },
];

export function CustomerLogos() {
  const [ref, isVisible] = useScrollReveal(0.1);

  return (
    <section
      ref={ref}
      aria-label="Our customers"
      style={{
        background: "#F7F6F3",
        padding: "clamp(32px, 4vw, 48px) var(--pad, clamp(20px, 5vw, 80px))",
        borderTop: "1px solid #E4E3DF",
        borderBottom: "1px solid #E4E3DF",
        overflow: "hidden",
      }}
    >
      <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.5 }}
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "11.5px",
            fontWeight: 600,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: "#9B9A96",
            textAlign: "center",
            marginBottom: "28px",
          }}
        >
          Trusted by fast-moving teams at
        </motion.p>

        {/* Logo strip with edge fades */}
        <div
          style={{
            position: "relative",
            maskImage:
              "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            style={{
              display: "flex",
              gap: "clamp(32px, 4vw, 56px)",
              justifyContent: "center",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {companyNames.map((company, i) => (
              <motion.div
                key={company.name}
                initial={{ opacity: 0, y: 8 }}
                animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                transition={{ delay: 0.1 * i + 0.3, duration: 0.4 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ fontSize: "16px", opacity: 0.5 }}
                >
                  {company.emoji}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-sans, system-ui)",
                    fontSize: "14px",
                    fontWeight: 600,
                    letterSpacing: "-0.2px",
                    color: "#9B9A96",
                  }}
                >
                  {company.name}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
