"use client";

/**
 * FAQSection.tsx — Day 9
 *
 * 8-question accordion. First item open by default.
 * Max-width: 800px (narrower than other sections for readability).
 * Background: white.
 *
 * Responsive:
 *   All widths: full-width accordion, text size clamps gracefully.
 *   Touch targets: ≥ 44px (achieved via 20px top+bottom padding on trigger).
 */

import { motion } from "framer-motion";
import { useScrollReveal } from "@/hooks/marketing/useScrollReveal";
import { useAccordion } from "@/hooks/marketing/useAccordion";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { AccordionItem } from "@/components/marketing/ui/AccordionItem";
import { faqItems } from "@/lib/marketing/content/faq.content";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function FAQSection() {
  const [ref, isVisible] = useScrollReveal(0.08);
  const { isOpen, toggle } = useAccordion(0); // first item open by default

  return (
    <section
      id="faq"
      ref={ref}
      aria-label="Frequently asked questions"
      style={{
        background: "white",
        padding: "clamp(64px, 9vw, 108px) var(--pad, clamp(20px, 5vw, 80px))",
      }}
    >
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        {/* ── Header ── */}
        <motion.div
          initial="hidden"
          animate={isVisible ? "visible" : "hidden"}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.1 } },
          }}
          style={{ marginBottom: "48px" }}
        >
          <motion.div variants={fadeUp}>
            <SectionLabel>FAQ</SectionLabel>
          </motion.div>

          <motion.h2
            variants={fadeUp}
            style={{
              fontFamily: "var(--font-serif, Georgia, serif)",
              fontSize: "clamp(28px, 4.2vw, 48px)",
              lineHeight: 1.1,
              letterSpacing: "-1.0px",
              color: "#0A0A0A",
              margin: "0",
              marginTop: "8px",
            }}
          >
            Everything you need to know.
          </motion.h2>
        </motion.div>

        {/* ── Accordion list ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          style={{
            borderTop: "1px solid #E4E3DF",
          }}
        >
          {faqItems.map((item, index) => (
            <AccordionItem
              key={index}
              index={index}
              question={item.question}
              answer={item.answer}
              isOpen={isOpen(index)}
              onToggle={() => toggle(index)}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
