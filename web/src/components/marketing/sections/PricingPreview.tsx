"use client";

/**
 * PricingPreview.tsx — Day 8, full premium rewrite
 *
 * Layout:
 *   Desktop (≥1024px): 4-column grid, Growth card lifted via marginTop/Bottom in card
 *   Tablet (768–1023px): 2×2 grid
 *   Mobile (<768px): Horizontal snap-scroll strip (cards min-width 280px)
 *                    OR tap anywhere to scroll; overflow-x auto
 *
 * Toggle: sliding pill indicator with framer-motion.
 * Section bg: #F2F1EE (gray-1)
 */

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { PricingCard } from "@/components/marketing/ui/PricingCard";
import { usePricingToggle } from "@/hooks/marketing/usePricingToggle";
import { pricingPlans } from "@/lib/marketing/content/pricing.content";

const containerVariant = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function PricingPreview() {
  const [ref, isVisible] = useScrollReveal(0.06);
  const { isAnnual, toggle } = usePricingToggle();

  return (
    <section
      id="pricing"
      ref={ref}
      aria-label="Pricing"
      style={{
        background: "#F2F1EE",
        padding: "clamp(64px, 9vw, 108px) var(--pad, clamp(20px, 5vw, 80px))",
      }}
    >
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        {/* ── Header ── */}
        <motion.div
          variants={containerVariant}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          style={{ marginBottom: "0" }}
        >
          <motion.div variants={fadeUp}>
            <SectionLabel>Pricing</SectionLabel>
          </motion.div>

          <motion.div variants={fadeUp} style={{ maxWidth: "580px" }}>
            <SectionHeading>
              {"Simple pricing. |One flat price per team.|"}
            </SectionHeading>
          </motion.div>

          <motion.p
            variants={fadeUp}
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "clamp(15px, 1.5vw, 17px)",
              fontWeight: 300,
              color: "#6B6A67",
              lineHeight: 1.65,
              marginTop: "12px",
              marginBottom: "36px",
              maxWidth: "440px",
            }}
          >
            No per-seat anxiety. Add your whole team freely.
          </motion.p>

          {/* ── Monthly / Annual toggle ── */}
          <motion.div variants={fadeUp} style={{ marginBottom: "52px" }}>
            <div
              role="group"
              aria-label="Billing period"
              style={{
                display: "inline-flex",
                background: "#E0DFDB",
                borderRadius: "100px",
                padding: "5px",
                gap: "2px",
                position: "relative",
              }}
            >
              {[
                { label: "Monthly", annual: false },
                { label: "Annual", annual: true, badge: "Save 20%" },
              ].map((opt) => {
                const isActive = isAnnual === opt.annual;
                return (
                  <button
                    key={opt.label}
                    onClick={toggle}
                    aria-pressed={isActive}
                    style={{
                      position: "relative",
                      background: isActive ? "white" : "transparent",
                      color: isActive ? "#0A0A0A" : "#6B6A67",
                      boxShadow: isActive
                        ? "0 1px 6px rgba(0,0,0,0.10)"
                        : "none",
                      border: "none",
                      borderRadius: "100px",
                      padding: "8px 22px",
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "13px",
                      fontWeight: isActive ? 600 : 400,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      transition:
                        "background 200ms ease, box-shadow 200ms ease, color 200ms ease, font-weight 200ms ease",
                      whiteSpace: "nowrap",
                      zIndex: 1,
                    }}
                  >
                    {opt.label}
                    {opt.badge && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          color: isActive ? "#1A6B3C" : "#9B9A96",
                          background: isActive ? "#E8F5EE" : "transparent",
                          padding: isActive ? "2px 7px" : "0",
                          borderRadius: "100px",
                          transition: "color 200ms ease, background 200ms ease",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {opt.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>

        {/* ── Pricing cards grid / scroll strip ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={isAnnual ? "annual" : "monthly"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {/* Desktop + tablet: CSS grid */}
            <div
              className="pricing-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "16px",
                alignItems: "stretch",
              }}
            >
              {pricingPlans.map((plan) => (
                <PricingCard key={plan.name} plan={plan} isAnnual={isAnnual} />
              ))}
            </div>

            {/* Mobile: horizontal snap-scroll strip */}
            <div
              className="pricing-scroll"
              style={{
                display: "none",
                overflowX: "auto",
                scrollSnapType: "x mandatory",
                WebkitOverflowScrolling: "touch",
                gap: "14px",
                paddingBottom: "16px",
                paddingTop: "8px",
                /* Extra horizontal padding so first/last card isn't flush */
                paddingLeft: "var(--pad, 20px)",
                paddingRight: "var(--pad, 20px)",
                marginLeft: "calc(-1 * var(--pad, 20px))",
                marginRight: "calc(-1 * var(--pad, 20px))",
                scrollbarWidth: "none",
              }}
            >
              {pricingPlans.map((plan) => (
                <div
                  key={plan.name}
                  style={{
                    scrollSnapAlign: "start",
                    flexShrink: 0,
                    width: "min(82vw, 300px)",
                  }}
                >
                  <PricingCard plan={plan} isAnnual={isAnnual} />
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ── Scroll hint on mobile ── */}
        <p className="pricing-scroll-hint" style={{ display: "none" }}>
          <span
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "12px",
              color: "#9B9A96",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginTop: "8px",
            }}
          >
            ← Swipe to compare plans →
          </span>
        </p>

        {/* ── Below grid notes ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          style={{ marginTop: "36px", textAlign: "center" }}
        >
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "13px",
              color: "#9B9A96",
              marginBottom: "10px",
              lineHeight: 1.6,
            }}
          >
            All paid plans include a 14-day free trial · No credit card required · Cancel anytime
          </p>
          <a
            href="/enterprise"
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "14px",
              color: "#1A6B3C",
              fontWeight: 500,
              textDecoration: "none",
            }}
            onMouseEnter={(e) =>
              ((e.target as HTMLAnchorElement).style.textDecoration = "underline")
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLAnchorElement).style.textDecoration = "none")
            }
          >
            Need more than 60 members? → Enterprise pricing
          </a>
        </motion.div>
      </div>

      {/* ── Responsive CSS ── */}
      <style>{`
        /* Tablet: 2×2 grid */
        @media (max-width: 1023px) and (min-width: 640px) {
          .pricing-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }

        /* Mobile: hide grid, show scroll strip */
        @media (max-width: 639px) {
          .pricing-grid { display: none !important; }
          .pricing-scroll { display: flex !important; }
          .pricing-scroll-hint { display: block !important; }
        }

        /* Hide scrollbar in WebKit */
        .pricing-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
}
