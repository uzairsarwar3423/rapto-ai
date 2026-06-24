"use client";

/**
 * Testimonials.tsx
 * Day 7 — 3 quote cards in a responsive horizontal layout.
 * White background. Card fade-up stagger.
 */

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { containerVariant, fadeUpVariant } from "@/lib/marketing/animations";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { TestimonialCard } from "@/components/marketing/ui/TestimonialCard";
import { testimonials } from "@/lib/marketing/content/testimonials.content";
import { analytics } from "@/lib/analytics";

const cardContainerVariant = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function Testimonials() {
  const [ref, isVisible] = useScrollReveal(0.08);

  useEffect(() => {
    if (isVisible) {
      analytics.testimonialSectionReached();
    }
  }, [isVisible]);

  return (
    <section
      ref={ref}
      aria-label="Testimonials"
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
            <SectionLabel>Testimonials</SectionLabel>
          </motion.div>

          <motion.div variants={fadeUpVariant} style={{ maxWidth: "560px" }}>
            <SectionHeading>
              {"Don&apos;t take our word for it — |ask their calendars.|"}
            </SectionHeading>
          </motion.div>
        </motion.div>

        {/* 3-column card grid */}
        <motion.div
          variants={cardContainerVariant}
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "20px",
            alignItems: "stretch",
          }}
          className="testimonials-grid"
        >
          {testimonials.map((t) => (
            <motion.div key={t.authorName} variants={cardVariant} style={{ height: "100%" }}>
              <TestimonialCard data={t} />
            </motion.div>
          ))}
        </motion.div>

        {/* Social proof bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "32px",
            marginTop: "48px",
            flexWrap: "wrap",
          }}
        >
          {[
            { value: "4.9 / 5", label: "Average rating" },
            { value: "200+", label: "Teams onboarded" },
            { value: "88%", label: "Commitment rate avg." },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                textAlign: "center",
                padding: "0 20px",
                borderRight: "1px solid #E4E3DF",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-serif, Georgia, serif)",
                  fontSize: "22px",
                  color: "#0A0A0A",
                  fontWeight: 400,
                  lineHeight: 1.2,
                  marginBottom: "4px",
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
      </div>

      <style>{`
        @media (max-width: 900px) {
          .testimonials-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 600px) {
          .testimonials-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
