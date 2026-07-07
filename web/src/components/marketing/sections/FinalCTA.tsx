"use client";

/**
 * FinalCTA.tsx — Day 9
 *
 * The closing dark section — most dramatic moment on the page.
 * Background: #0A0A0A (3rd and final dark section)
 * Layout: centered, max-width 760px
 *
 * Responsive:
 *   Desktop: buttons side by side
 *   Mobile: buttons stack full-width
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { openWaitlistModal } from "@/hooks/marketing/useWaitlistModal";
import { analytics } from "@/lib/analytics";

const containerVariant = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function FinalCTA() {
  const [ref, isVisible] = useScrollReveal(0.1);
  const [primaryHovered, setPrimaryHovered] = useState(false);
  const [secondaryHovered, setSecondaryHovered] = useState(false);

  return (
    <section
      ref={ref}
      aria-label="Get started with Rapto"
      style={{
        background: "#0A0A0A",
        padding: "clamp(72px, 10vw, 120px) var(--pad, clamp(20px, 5vw, 80px))",
        width: "100%",
      }}
    >
      <motion.div
        variants={containerVariant}
        initial="hidden"
        animate={isVisible ? "visible" : "hidden"}
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        {/* ── Small label ── */}
        <motion.span
          variants={fadeUp}
          style={{
            display: "block",
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
            marginBottom: "24px",
          }}
        >
          Get started today
        </motion.span>

        {/* ── Main headline ── */}
        <motion.h2
          variants={fadeUp}
          style={{
            fontFamily: "var(--font-serif, Georgia, serif)",
            fontSize: "clamp(40px, 6vw, 72px)",
            lineHeight: 1.08,
            letterSpacing: "-2px",
            color: "white",
            margin: "0",
          }}
        >
          Stop chasing your team.{" "}
          <br className="final-cta-br" />
          {"Let Rapto "}
          <em
            style={{
              fontStyle: "italic",
              color: "#6ECC8E",
              fontWeight: "normal",
            }}
          >
            do it.
          </em>
        </motion.h2>

        {/* ── Subheadline ── */}
        <motion.p
          variants={fadeUp}
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "clamp(15px, 1.6vw, 17px)",
            fontWeight: 300,
            color: "rgba(255,255,255,0.5)",
            lineHeight: 1.7,
            margin: "24px 0 40px",
            maxWidth: "500px",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Set up in 5 minutes. Bot joins your next meeting automatically.
          <br />
          First 14 days free.
        </motion.p>

        {/* ── Button group ── */}
        <motion.div
          variants={fadeUp}
          style={{
            display: "flex",
            gap: "14px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Primary */}
          <button
            onMouseEnter={() => setPrimaryHovered(true)}
            onMouseLeave={() => setPrimaryHovered(false)}
            onClick={() => {
              analytics.heroCTAClick();
              openWaitlistModal();
            }}
            style={{
              background: primaryHovered ? "#6ECC8E" : "white",
              color: "#0A0A0A",
              border: "none",
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "15px",
              fontWeight: 500,
              padding: "14px 34px",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "background 200ms ease, transform 150ms ease",
              transform: primaryHovered ? "translateY(-1px)" : "translateY(0)",
              letterSpacing: "-0.1px",
              flexShrink: 0,
            }}
            aria-label="Start your free trial"
          >
            Start free trial →
          </button>

          {/* Secondary */}
          <button
            onMouseEnter={() => setSecondaryHovered(true)}
            onMouseLeave={() => setSecondaryHovered(false)}
            onClick={() => {
              analytics.demoRequestClick();
              openWaitlistModal();
            }}
            style={{
              background: "transparent",
              color: secondaryHovered ? "white" : "rgba(255,255,255,0.6)",
              border: `1px solid ${secondaryHovered ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)"}`,
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "15px",
              fontWeight: 400,
              padding: "14px 34px",
              borderRadius: "8px",
              cursor: "pointer",
              transition:
                "color 200ms ease, border-color 200ms ease, transform 150ms ease",
              transform: secondaryHovered ? "translateY(-1px)" : "translateY(0)",
              flexShrink: 0,
            }}
            aria-label="See a product demo"
          >
            See a demo
          </button>
        </motion.div>

        {/* ── Trust note ── */}
        <motion.p
          variants={fadeUp}
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "12px",
            color: "rgba(255,255,255,0.3)",
            marginTop: "18px",
            lineHeight: 1.6,
          }}
        >
          No credit card · Works with Zoom, Meet &amp; Teams · Cancel anytime
        </motion.p>
      </motion.div>

      {/* ── Responsive CSS ── */}
      <style>{`
        /* On smaller screens, break line looks better removed */
        @media (max-width: 480px) {
          .final-cta-br { display: none; }
        }
        /* Stack buttons on narrow mobile */
        @media (max-width: 400px) {
          .final-cta-buttons {
            flex-direction: column !important;
          }
          .final-cta-buttons button {
            width: 100% !important;
          }
        }
      `}</style>
    </section>
  );
}
