"use client";

/**
 * ProblemStatement.tsx
 * Contrasting Grid: Left (Pain / Without Vocaply) vs Right (Value / With Vocaply)
 * Uses IntersectionObserver hook for staggered reveal animations.
 */

import { motion } from "framer-motion";
import * as Lucide from "lucide-react";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { containerVariant, fadeUpVariant } from "@/lib/marketing/animations";
import {
  problemHeaderLabel,
  problemHeadline,
  problemSubheadline,
  withoutVocaply,
  withVocaply,
} from "@/lib/marketing/content/problem.content";

export function ProblemStatement() {
  const [sectionRef, isVisible] = useScrollReveal(0.12);

  const renderIcon = (name: string, isSolution: boolean) => {
    const IconComponent = (Lucide as any)[name];
    if (!IconComponent) return null;
    return (
      <IconComponent
        size={18}
        style={{
          color: isSolution ? "#1A6B3C" : "#C84B31",
          flexShrink: 0,
          marginTop: "3px",
        }}
      />
    );
  };

  return (
    <section
      id="problem"
      ref={sectionRef}
      aria-label="Problem statement"
      style={{
        background: "#FFFFFF",
        paddingTop: "clamp(60px, 8vw, 100px)",
        paddingBottom: "clamp(60px, 8vw, 100px)",
        paddingLeft: "var(--pad)",
        paddingRight: "var(--pad)",
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
          <SectionLabel>{problemHeaderLabel}</SectionLabel>
        </div>

        <h2
          style={{
            fontFamily: "var(--font-serif, Georgia, serif)",
            fontSize: "clamp(28px, 4.2vw, 48px)",
            lineHeight: 1.1,
            letterSpacing: "-1.0px",
            color: "#0A0A0A",
            marginBottom: "16px",
            maxWidth: "640px",
          }}
        >
          {problemHeadline}
        </h2>

        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "clamp(15px, 1.8vw, 17px)",
            fontWeight: 300,
            color: "#6B6A67",
            lineHeight: 1.65,
            maxWidth: "520px",
            marginBottom: "52px",
          }}
        >
          {problemSubheadline}
        </p>

        {/* ── Contrast Grid ─────────────────────────────────── */}
        <motion.div
          variants={containerVariant}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          className="contrast-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2px",
            background: "#E4E3DF", // Gap color acting as divider
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid #E4E3DF",
          }}
        >
          {/* LEFT — WITHOUT VOCAPLY */}
          <motion.div
            variants={fadeUpVariant}
            className="contrast-col pain-col"
            style={{
              background: "#FFFFFF",
              padding: "40px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "28px",
              }}
            >
              <span
                style={{
                  color: "#C84B31",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
                aria-hidden="true"
              >
                ✕
              </span>
              <span
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#C84B31",
                  lineHeight: 1,
                }}
              >
                Without Vocaply
              </span>
            </div>

            {/* List */}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {withoutVocaply.map((item, index) => (
                <li
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    marginBottom: index === withoutVocaply.length - 1 ? 0 : "20px",
                  }}
                >
                  {renderIcon(item.iconName, false)}
                  <p
                    style={{
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "14px",
                      lineHeight: 1.55,
                      color: "#6B6A67",
                      margin: 0,
                    }}
                  >
                    <strong style={{ color: "#0A0A0A", fontWeight: 500 }}>
                      {item.strongText}
                    </strong>
                    {item.text}
                  </p>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* RIGHT — WITH VOCAPLY */}
          <motion.div
            variants={fadeUpVariant}
            className="contrast-col solution-col"
            style={{
              background: "#E8F5EE", // accent-light
              padding: "40px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "28px",
              }}
            >
              <span
                style={{
                  color: "#1A6B3C",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
                aria-hidden="true"
              >
                ✓
              </span>
              <span
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#1A6B3C",
                  lineHeight: 1,
                }}
              >
                With Vocaply
              </span>
            </div>

            {/* List */}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {withVocaply.map((item, index) => (
                <li
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    marginBottom: index === withVocaply.length - 1 ? 0 : "20px",
                  }}
                >
                  {renderIcon(item.iconName, true)}
                  <p
                    style={{
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "14px",
                      lineHeight: 1.55,
                      color: "#6B6A67",
                      margin: 0,
                    }}
                  >
                    <strong style={{ color: "#0D3E23", fontWeight: 600 }}>
                      {item.strongText}
                    </strong>
                    {item.text}
                  </p>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      </div>

      <style>{`
        /* Mobile Breakpoint */
        @media (max-width: 768px) {
          .contrast-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
            background: transparent !important;
            border: none !important;
          }

          .contrast-col {
            border-radius: 10px !important;
            border: 1px solid #E4E3DF !important;
            padding: 28px 24px !important;
          }

          .solution-col {
            border-color: rgba(26,107,60,0.15) !important;
          }
        }
      `}</style>
    </section>
  );
}
