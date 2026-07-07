"use client";

/**
 * AICapabilities.tsx
 * Dark-themed section presenting AI extraction precision.
 * Features an interactive step-by-step extraction animation with reset loops.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import * as Lucide from "lucide-react";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { containerVariant, fadeUpVariant } from "@/lib/marketing/animations";
import {
  aiClaims,
  accuracyBadgeText,
  extractionSentence,
} from "@/lib/marketing/content/ai-capabilities.content";

export function AICapabilities() {
  const [sectionRef, isVisible] = useScrollReveal(0.12);
  const [stage, setStage] = useState(0); // 0: clear, 1: owner, 2: commitment, 3: date/all

  useEffect(() => {
    if (!isVisible) {
      setStage(0);
      return;
    }

    let t1: NodeJS.Timeout;
    let t2: NodeJS.Timeout;
    let t3: NodeJS.Timeout;
    let resetTimer: NodeJS.Timeout;
    let interval: NodeJS.Timeout;

    const startSequence = () => {
      setStage(0);

      t1 = setTimeout(() => {
        setStage(1);
      }, 1000);

      t2 = setTimeout(() => {
        setStage(2);
      }, 2000);

      t3 = setTimeout(() => {
        setStage(3);
      }, 3000);

      resetTimer = setTimeout(() => {
        setStage(4); // transition stage to clear highlights
      }, 6500);
    };

    // Initial trigger
    startSequence();

    // Continuous loop trigger every 7.5 seconds
    interval = setInterval(startSequence, 7500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(resetTimer);
      clearInterval(interval);
    };
  }, [isVisible]);

  return (
    <section
      id="ai-capabilities"
      ref={sectionRef}
      aria-label="AI Capabilities"
      style={{
        background: "#0A0A0A", // Full black dark mode contrast section
        paddingTop: "clamp(60px, 8vw, 100px)",
        paddingBottom: "clamp(60px, 8vw, 100px)",
        paddingLeft: "var(--pad)",
        paddingRight: "var(--pad)",
        width: "100%",
        boxSizing: "border-box",
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
        <div style={{ marginBottom: "8px" }}>
          <SectionLabel color="rgba(255,255,255,0.4)">
            AI capabilities
          </SectionLabel>
        </div>

        <div style={{ marginBottom: "48px", maxWidth: "600px" }}>
          <SectionHeading theme="dark">
            Extraction that understands |what was actually said.|
          </SectionHeading>
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "clamp(15px, 1.8vw, 17px)",
              fontWeight: 300,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.65,
              marginTop: "16px",
              marginRight: 0,
              marginBottom: 0,
              marginLeft: 0,
            }}
          >
            Not keyword matching. Not templated summaries. Rapto uses Claude
            AI to understand context, intent, and meaning — so it catches the
            commitments others miss.
          </p>
        </div>

        {/* ── Interactive Demo Card ─────────────────────────── */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding: "32px",
            maxWidth: "680px",
            marginLeft: "auto",
            marginRight: "auto",
            marginBottom: "64px",
            boxSizing: "border-box",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.4)",
              marginBottom: "20px",
              lineHeight: 1,
            }}
          >
            Try it — watch how Rapto parses this:
          </p>

          {/* Sentence Display Area */}
          <div
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "clamp(18px, 2.5vw, 22px)",
              fontWeight: 300,
              color: "#FAFAF8",
              lineHeight: 1.8,
              marginBottom: "32px",
            }}
          >
            {/* Owner Span */}
            <span
              className="anim-span"
              style={{
                borderRadius: "4px",
                padding: "2px 4px",
                transition: "background 300ms ease, border-bottom 300ms ease",
                background:
                  stage >= 1 && stage < 4 ? "rgba(26,107,60,0.25)" : "transparent",
                borderBottom:
                  stage >= 1 && stage < 4 ? "2px solid #6ECC8E" : "2px solid transparent",
              }}
            >
              {extractionSentence.part1}
            </span>

            {/* Commitment Span */}
            <span
              className="anim-span"
              style={{
                borderRadius: "4px",
                padding: "2px 4px",
                transition: "background 300ms ease, border-bottom 300ms ease",
                background:
                  stage >= 2 && stage < 4 ? "rgba(59,130,246,0.2)" : "transparent",
                borderBottom:
                  stage >= 2 && stage < 4 ? "2px solid #60A5FA" : "2px solid transparent",
              }}
            >
              {extractionSentence.part2}
            </span>

            {/* Date Span */}
            <span
              className="anim-span"
              style={{
                borderRadius: "4px",
                padding: "2px 4px",
                transition: "background 300ms ease, border-bottom 300ms ease",
                background:
                  stage >= 3 && stage < 4 ? "rgba(245,158,11,0.2)" : "transparent",
                borderBottom:
                  stage >= 3 && stage < 4 ? "2px solid #F59E0B" : "2px solid transparent",
              }}
            >
              {extractionSentence.part3}
            </span>
          </div>

          {/* Parsed Metadata Output Pills */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              minHeight: "32px",
            }}
          >
            {/* Owner Badge */}
            <div
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "11px",
                fontWeight: 500,
                background: "#1A6B3C",
                color: "#FAFAF8",
                padding: "4px 10px",
                borderRadius: "100px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "opacity 300ms ease, transform 300ms ease",
                opacity: stage >= 1 && stage < 4 ? 1 : 0,
                transform:
                  stage >= 1 && stage < 4 ? "translateY(0)" : "translateY(4px)",
              }}
            >
              <Lucide.User size={12} />
              Owner: Ahmed Hassan
            </div>

            {/* Commitment Badge */}
            <div
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "11px",
                fontWeight: 500,
                background: "#2563EB",
                color: "#FAFAF8",
                padding: "4px 10px",
                borderRadius: "100px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "opacity 300ms ease, transform 300ms ease",
                opacity: stage >= 2 && stage < 4 ? 1 : 0,
                transform:
                  stage >= 2 && stage < 4 ? "translateY(0)" : "translateY(4px)",
              }}
            >
              <Lucide.CheckSquare size={12} />
              Commitment: Finish login feature
            </div>

            {/* Date Badge */}
            <div
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "11px",
                fontWeight: 500,
                background: "#D97706",
                color: "#FAFAF8",
                padding: "4px 10px",
                borderRadius: "100px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "opacity 300ms ease, transform 300ms ease",
                opacity: stage >= 3 && stage < 4 ? 1 : 0,
                transform:
                  stage >= 3 && stage < 4 ? "translateY(0)" : "translateY(4px)",
              }}
            >
              <Lucide.Calendar size={12} />
              Deadline: May 15, 2026 (Thursday)
            </div>
          </div>
        </div>

        {/* ── 4 Claims Grid ─────────────────────────────────── */}
        <motion.div
          variants={containerVariant}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          className="claims-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "36px 48px",
            maxWidth: "920px",
            marginLeft: "auto",
            marginRight: "auto",
            marginBottom: "56px",
          }}
        >
          {aiClaims.map((claim) => {
            const IconComponent = (Lucide as any)[claim.iconName];
            return (
              <motion.div
                variants={fadeUpVariant}
                key={claim.title}
                style={{
                  display: "flex",
                  gap: "16px",
                  alignItems: "flex-start",
                }}
              >
                {/* Icon Circle */}
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6ECC8E", // Light green accent
                    flexShrink: 0,
                  }}
                >
                  {IconComponent && <IconComponent size={18} />}
                </div>

                {/* Text Blocks */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4
                    style={{
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#FAFAF8",
                      marginBottom: "6px",
                      lineHeight: 1.3,
                    }}
                  >
                    {claim.title}
                  </h4>
                  <p
                    style={{
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "13.5px",
                      color: "rgba(255,255,255,0.5)",
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {claim.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* ── Muted accuracy badge ──────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "12px",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "100px",
              padding: "8px 18px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#6ECC8E",
                display: "block",
              }}
              aria-hidden="true"
            />
            <span
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "12.5px",
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1,
              }}
            >
              {accuracyBadgeText}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        /* Mobile Breakpoint */
        @media (max-width: 768px) {
          .claims-grid {
            grid-template-columns: 1fr !important;
            gap: 28px !important;
          }
        }
      `}</style>
    </section>
  );
}
