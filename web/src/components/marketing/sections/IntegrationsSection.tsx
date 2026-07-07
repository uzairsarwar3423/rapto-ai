"use client";

/**
 * IntegrationsSection.tsx
 * Day 6 — Premium integrations section.
 *
 * Layout:
 *   - Left column (40%): label, headline, subheadline, caption, trust note
 *   - Right column (60%): flowing badge grid with real icons
 *
 * Mobile: stacked, badges become full-width flex-wrap
 * All real SVG icons loaded via Next.js <Image>; emoji fallback for gaps.
 */

import { motion } from "framer-motion";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { containerVariant, fadeUpVariant } from "@/lib/marketing/animations";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { IntegrationBadge } from "@/components/marketing/ui/IntegrationBadge";
import {
  activeIntegrations,
  comingSoonIntegrations,
} from "@/lib/marketing/content/integrations.content";

interface IntegrationsSectionProps {
  id?: string;
}

// Stagger variant for badge rows
const badgeContainerVariant = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.2 },
  },
};

const badgeVariant = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number,number,number,number] },
  },
};

export function IntegrationsSection({ id }: IntegrationsSectionProps) {
  const [ref, isVisible] = useScrollReveal(0.1);

  return (
    <section
      id={id}
      aria-label="Integrations"
      style={{
        background: "#F2F1EE",
        padding: "clamp(64px, 9vw, 108px) var(--pad, clamp(20px, 5vw, 80px))",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle background accent blob */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-80px",
          right: "-120px",
          width: "480px",
          height: "480px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(26,107,60,0.055) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        ref={ref}
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* ── Two-column desktop layout ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.4fr",
            gap: "clamp(40px, 6vw, 80px)",
            alignItems: "center",
          }}
          className="integrations-grid"
        >
          {/* LEFT — copy */}
          <motion.div
            variants={containerVariant}
            initial="hidden"
            animate={isVisible ? "visible" : "hidden"}
          >
            <motion.div variants={fadeUpVariant}>
              <SectionLabel>Integrations</SectionLabel>
            </motion.div>

            <motion.div variants={fadeUpVariant} style={{ marginBottom: "20px" }}>
              <SectionHeading>
                {"Plays well with |everything you use.|"}
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
                marginBottom: "32px",
                maxWidth: "400px",
              }}
            >
              No ripping out your stack. Rapto connects to the tools your
              team already lives in — one-click setup, OAuth-secured.
            </motion.p>

            {/* Stats row */}
            <motion.div
              variants={fadeUpVariant}
              style={{
                display: "flex",
                gap: "28px",
                flexWrap: "wrap",
              }}
            >
              {[
                { value: "9+", label: "Integrations" },
                { value: "< 2 min", label: "Setup time" },
                { value: "OAuth", label: "Secure auth" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p
                    style={{
                      fontFamily: "var(--font-serif, Georgia, serif)",
                      fontSize: "22px",
                      fontWeight: 400,
                      color: "#1A6B3C",
                      lineHeight: 1.1,
                      marginBottom: "2px",
                    }}
                  >
                    {stat.value}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "11px",
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      color: "#9B9A96",
                    }}
                  >
                    {stat.label}
                  </p>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* RIGHT — badge grid */}
          <motion.div
            variants={badgeContainerVariant}
            initial="hidden"
            animate={isVisible ? "visible" : "hidden"}
            style={{ width: "100%" }}
          >
            {/* Active integrations */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              {activeIntegrations.map((integration) => (
                <motion.div key={integration.name} variants={badgeVariant}>
                  <IntegrationBadge integration={integration} />
                </motion.div>
              ))}
            </div>

            {/* Coming soon row */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "20px",
              }}
            >
              {comingSoonIntegrations.map((integration) => (
                <motion.div key={integration.name} variants={badgeVariant}>
                  <IntegrationBadge integration={integration} />
                </motion.div>
              ))}
            </div>

            {/* Caption */}
            <motion.p
              variants={badgeVariant}
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "12px",
                fontStyle: "italic",
                color: "#9B9A96",
                lineHeight: 1.5,
              }}
            >
              More integrations shipping every sprint. Request yours →
            </motion.p>
          </motion.div>
        </div>
      </div>

      {/* ── Responsive CSS ── */}
      <style>{`
        @media (max-width: 767px) {
          .integrations-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
