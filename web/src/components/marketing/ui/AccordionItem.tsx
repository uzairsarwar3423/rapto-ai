"use client";

/**
 * AccordionItem.tsx — Day 9
 * Single FAQ accordion row.
 *
 * Closed: question + chevron-down icon
 * Open:   question + answer (Framer Motion height animation) + rotated chevron
 *
 * Accessibility: aria-expanded, aria-controls, keyboard-friendly (Enter/Space)
 */

import { useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { analytics } from "@/lib/analytics";

interface AccordionItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}

export function AccordionItem({
  question,
  answer,
  isOpen,
  onToggle,
  index,
}: AccordionItemProps) {
  const panelId = useId();
  const triggerId = useId();

  return (
    <div
      style={{
        borderBottom: "1px solid #E4E3DF",
      }}
    >
      {/* ── Question trigger ── */}
      <button
        id={triggerId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => {
          if (!isOpen) {
            analytics.faqOpened(question);
          }
          onToggle();
        }}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          padding: "20px 0",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: "16px",
          outline: "none",
        }}
        onFocus={(e) => {
          (e.currentTarget as HTMLButtonElement).style.outline =
            "2px solid #1A6B3C";
          (e.currentTarget as HTMLButtonElement).style.outlineOffset = "2px";
          (e.currentTarget as HTMLButtonElement).style.borderRadius = "4px";
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLButtonElement).style.outline = "none";
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "clamp(14px, 1.5vw, 15px)",
            fontWeight: 500,
            color: "#0A0A0A",
            lineHeight: 1.45,
            flex: 1,
            textAlign: "left",
          }}
        >
          {question}
        </span>

        {/* Rotating chevron */}
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          style={{
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            color: "#9B9A96",
          }}
        >
          <ChevronDown size={16} strokeWidth={2} />
        </motion.span>
      </button>

      {/* ── Answer panel (Framer Motion height animation) ── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={triggerId}
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ paddingBottom: "20px" }}>
              <p
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "clamp(13px, 1.4vw, 14px)",
                  color: "#6B6A67",
                  lineHeight: 1.75,
                  margin: 0,
                  maxWidth: "640px",
                }}
              >
                {answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
