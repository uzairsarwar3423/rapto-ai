"use client";

/**
 * CaseStudy.tsx
 * Day 8 — Dark section (#0A0A0A). Left: story + pull quote. Right: 3 animated metrics.
 *
 * Mobile: metrics row (horizontal, smaller) ABOVE story column.
 * Uses AnimatedNumber component from Day 7 for scroll-triggered count-up.
 */

import { motion } from "framer-motion";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { containerVariant, fadeUpVariant } from "@/lib/marketing/animations";
import { AnimatedNumber } from "@/components/marketing/ui/AnimatedNumber";
import { caseStudyContent, caseStudyMetrics } from "@/lib/marketing/content/casestudy.content";
import { analytics } from "@/lib/analytics";

export function CaseStudy() {
  const [ref, isVisible] = useScrollReveal(0.08);

  return (
    <section
      ref={ref}
      aria-label="Case study — TechFlow"
      style={{
        background: "#0A0A0A",
        padding: "clamp(64px, 9vw, 108px) var(--pad, clamp(20px, 5vw, 80px))",
      }}
    >
      <div
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
        }}
      >
        {/* ── Desktop: 2-col grid / Mobile: stacked ── */}
        <div
          className="casestudy-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "clamp(40px, 6vw, 80px)",
            alignItems: "center",
          }}
        >
          {/* ── LEFT — Story ── */}
          <motion.div
            variants={containerVariant}
            initial="hidden"
            animate={isVisible ? "visible" : "hidden"}
          >
            {/* Label */}
            <motion.p
              variants={fadeUpVariant}
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.4)",
                marginBottom: "20px",
              }}
            >
              {caseStudyContent.label}
            </motion.p>

            {/* Headline */}
            <motion.h2
              variants={fadeUpVariant}
              style={{
                fontFamily: "var(--font-serif, Georgia, serif)",
                fontSize: "clamp(26px, 3.2vw, 42px)",
                fontWeight: 400,
                color: "white",
                lineHeight: 1.2,
                letterSpacing: "-0.5px",
                marginBottom: "24px",
              }}
            >
              {caseStudyContent.headlineParts.before}
              <span style={{ color: "#6ECC8E" }}>
                {caseStudyContent.headlineParts.accent}
              </span>
              {caseStudyContent.headlineParts.after}
            </motion.h2>

            {/* Body */}
            <motion.p
              variants={fadeUpVariant}
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "15px",
                fontWeight: 300,
                color: "rgba(255,255,255,0.6)",
                lineHeight: 1.75,
                marginBottom: "28px",
              }}
            >
              {caseStudyContent.body}
            </motion.p>

            {/* Pull quote */}
            <motion.blockquote
              variants={fadeUpVariant}
              style={{
                borderLeft: "3px solid #1A6B3C",
                paddingLeft: "20px",
                margin: "0 0 28px",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-serif, Georgia, serif)",
                  fontSize: "16px",
                  fontStyle: "italic",
                  color: "rgba(255,255,255,0.85)",
                  lineHeight: 1.7,
                  marginBottom: "8px",
                }}
              >
                {caseStudyContent.pullQuote}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                {caseStudyContent.pullQuoteAttribution}
              </p>
            </motion.blockquote>

            {/* CTA */}
            <motion.a
              variants={fadeUpVariant}
              href={caseStudyContent.ctaHref}
              onClick={() => analytics.caseStudyCTAClick()}
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "14px",
                fontWeight: 500,
                color: "#6ECC8E",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none";
              }}
            >
              {caseStudyContent.ctaText} →
            </motion.a>
          </motion.div>

          {/* ── RIGHT — Metrics ── */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="casestudy-metrics"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "40px",
            }}
          >
            {caseStudyMetrics.map((metric, i) => (
              <div
                key={i}
                style={{
                  paddingBottom: i < caseStudyMetrics.length - 1 ? "40px" : "0",
                  borderBottom:
                    i < caseStudyMetrics.length - 1
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "none",
                }}
              >
                <AnimatedNumber
                  to={metric.to}
                  suffix={metric.suffix}
                  decimals={metric.decimals ?? 0}
                  duration={1500}
                  fontSize="clamp(48px, 5.5vw, 68px)"
                  color="#6ECC8E"
                  label={metric.label}
                  labelColor="rgba(255,255,255,0.45)"
                />
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ── Responsive ── */}
      <style>{`
        @media (max-width: 767px) {
          .casestudy-grid {
            grid-template-columns: 1fr !important;
          }
          .casestudy-metrics {
            flex-direction: row !important;
            gap: 24px !important;
            flex-wrap: wrap;
            order: -1;
            margin-bottom: 8px;
          }
        }
      `}</style>
    </section>
  );
}
