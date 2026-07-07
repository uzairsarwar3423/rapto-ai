"use client";

import { motion } from "framer-motion";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { MockBrowserFrame } from "@/components/marketing/mock/MockBrowserFrame";
import { MockAppSidebar } from "@/components/marketing/mock/MockAppSidebar";
import { MockCommitmentsView } from "@/components/marketing/mock/MockCommitmentsView";
import { heroContent } from "@/lib/marketing/content/hero.content";
import { openWaitlistModal } from "@/hooks/marketing/useWaitlistModal";
import { analytics, trackEvent } from "@/lib/analytics";

/**
 * HeroSection — First viewport. The most important section.
 *
 * Layout:
 *   Desktop: 2-column grid (55% text | 45% visual)
 *   Mobile:  Single column (text on top, browser mock below — fully responsive)
 *
 * Day 3: Right column has real MockBrowserFrame + MockCommitmentsView.
 */
export function HeroSection() {
  return (
    <section
      id="hero"
      aria-label="Hero section"
      style={{
        background: "#FAFAF8",
        position: "relative",
        paddingTop: "clamp(56px, 10vw, 120px)",
        paddingBottom: "clamp(48px, 8vw, 100px)",
        paddingLeft: "var(--pad)",
        paddingRight: "var(--pad)",
        overflowX: "hidden",
      }}
    >
      {/* Subtle radial green glow — top center */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-100px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "900px",
          height: "700px",
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(26,107,60,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />

      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          position: "relative",
          width: "100%",
        }}
      >
        {/* ── 2-column grid (collapses to 1 on mobile) ─────────── */}
        <div className="hero-grid">

          {/* ── LEFT — Text content ─────────────────────────────── */}
          <div className="hero-text">

            {/* Badge pill */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <SectionLabel asPill>
                {heroContent.badgeText}
              </SectionLabel>
            </motion.div>

            {/* H1 Headline */}
            <h1 className="hero-headline" style={{ display: "flex", flexDirection: "column" }}>
              <motion.span
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                style={{ display: "block" }}
              >
                {heroContent.headlinePart1}
              </motion.span>
              <motion.em
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                style={{ fontStyle: "italic", color: "#1A6B3C", display: "block" }}
              >
                {heroContent.headlineAccent}
              </motion.em>
            </h1>

            {/* Subheadline */}
            <motion.p
              className="hero-sub"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.62, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {heroContent.subheadline}
            </motion.p>

            <motion.div
              className="hero-ctas"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.75, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {/* Primary CTA */}
              <button
                onClick={() => {
                  analytics.heroCTAClick();
                  openWaitlistModal();
                }}
                id="hero-primary-cta"
                className="hero-primary-btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "14px 28px",
                  background: "#1A6B3C",
                  color: "#FAFAF8",
                  fontFamily: "var(--font-sans)",
                  fontSize: "15px",
                  fontWeight: 500,
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  letterSpacing: "-0.1px",
                  boxShadow:
                    "0 1px 3px rgba(26,107,60,0.3), 0 4px 16px rgba(26,107,60,0.15)",
                  transition:
                    "background 200ms ease, transform 200ms ease, box-shadow 200ms ease",
                  whiteSpace: "nowrap",
                }}
              >
                {heroContent.primaryCTA.text}
              </button>

              {/* Ghost CTA */}
              <button
                onClick={() => {
                  trackEvent("hero_cta_click", { cta_text: heroContent.secondaryCTA.text, position: "hero_secondary" });
                  openWaitlistModal();
                }}
                id="hero-secondary-cta"
                className="hero-ghost-btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  padding: "14px 20px",
                  color: "#6B6A67",
                  fontFamily: "var(--font-sans)",
                  fontSize: "15px",
                  fontWeight: 400,
                  borderRadius: "6px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  transition: "color 150ms ease, background 150ms ease",
                  whiteSpace: "nowrap",
                }}
              >
                {heroContent.secondaryCTA.text}
              </button>
            </motion.div>

            {/* Trust note */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.85 }}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "12px",
                fontWeight: 400,
                color: "#9B9A96",
                lineHeight: 1.6,
                marginTop: "16px",
                letterSpacing: "0.01em",
              }}
            >
              {heroContent.trustNote}
            </motion.p>
          </div>

          {/* ── RIGHT — Product visual ─────────────────────────── */}
          <motion.div
            className="hero-visual-wrap"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.95, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <MockBrowserFrame urlText="app.rapto.ai/commitments">
              <MockAppSidebar />
              <MockCommitmentsView />
            </MockBrowserFrame>
          </motion.div>

        </div>
      </div>

      {/* ── Responsive styles ────────────────────────────────── */}
      <style>{`

        /*━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           HEADLINE & BODY TYPOGRAPHY
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        .hero-headline {
          font-family: var(--font-serif);
          font-size: clamp(38px, 5.5vw, 74px);
          line-height: 1.06;
          letter-spacing: -1.5px;
          color: #0A0A0A;
          margin-bottom: 20px;
          max-width: 680px;
        }

        .hero-sub {
          font-family: var(--font-sans);
          font-size: clamp(15px, 1.8vw, 19px);
          font-weight: 300;
          color: #6B6A67;
          line-height: 1.65;
          max-width: 500px;
          margin-bottom: 36px;
        }

        /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           GRID LAYOUT
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        .hero-grid {
          display: grid;
          grid-template-columns: 47fr 53fr;
          gap: 48px;
          align-items: center;
        }

        .hero-text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .hero-visual-wrap {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          width: 100%;
          min-width: 0;
        }

        /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           CTA BUTTONS
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        .hero-ctas {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .hero-primary-btn:hover {
          background: #2D8A50 !important;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(26,107,60,0.35),
                      0 8px 24px rgba(26,107,60,0.2) !important;
        }

        .hero-ghost-btn:hover {
          color: #0A0A0A !important;
          background: rgba(0,0,0,0.04) !important;
        }

        /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           TABLET  ≤ 1024px
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        @media (max-width: 1024px) {
          .hero-grid {
            grid-template-columns: 50fr 50fr;
            gap: 24px;
          }
        }

        /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           MOBILE  ≤ 768px
           Single-column, text first
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        @media (max-width: 768px) {
          .hero-grid {
            grid-template-columns: 1fr;
            gap: 32px;
          }

          .hero-text  { order: 1; }
          .hero-visual-wrap { order: 2; width: 100%; }

          .hero-headline {
            font-size: clamp(34px, 8vw, 48px);
            letter-spacing: -1px;
            margin-bottom: 16px;
          }

          .hero-sub {
            font-size: 16px;
            max-width: 100%;
            margin-bottom: 28px;
          }

          /* Full-width stacked CTAs */
          .hero-ctas {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            width: 100%;
          }

          .hero-ctas a {
            width: 100%;
            justify-content: center;
            text-align: center;
            box-sizing: border-box;
          }
        }

        /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           SMALL MOBILE  ≤ 480px
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
        @media (max-width: 480px) {
          .hero-grid {
            gap: 24px;
          }

          .hero-headline {
            font-size: clamp(30px, 8vw, 42px);
          }
        }

      `}</style>
    </section>
  );
}
