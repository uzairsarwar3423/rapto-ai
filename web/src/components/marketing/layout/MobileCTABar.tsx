"use client";

/**
 * MobileCTABar.tsx — Day 9
 *
 * Fixed bottom bar — only visible on mobile (< 768px).
 * Appears after 300px scroll with smooth fade + slide-up animation.
 * Handles iPhone safe area (notch / home indicator).
 * 
 * Responsive:
 *   ≥ 768px: display: none (CSS class)
 *   < 768px: renders as fixed bottom bar with full-width button
 */

import { motion, AnimatePresence } from "framer-motion";
import { useMobileCTABar } from "@/hooks/marketing/useMobileCTABar";
import { useState } from "react";
import { openWaitlistModal } from "@/hooks/marketing/useWaitlistModal";
import { analytics } from "@/lib/analytics";

export function MobileCTABar() {
  const { visible } = useMobileCTABar();
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    if (typeof window !== "undefined") {
      analytics.mobileCTABarClick(Math.round(window.scrollY));
    }
    openWaitlistModal();
  };

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            className="mobile-cta-bar"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              background: "white",
              borderTop: "1px solid #E4E3DF",
              padding: "12px 16px",
              /* Safe area for iPhone notch / home indicator */
              paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <button
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onClick={handleClick}
              aria-label="Start your free trial — no credit card required"
              style={{
                width: "100%",
                background: hovered ? "#1A6B3C" : "#0A0A0A",
                color: "white",
                border: "none",
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "15px",
                fontWeight: 500,
                padding: "14px 20px",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "background 200ms ease",
                letterSpacing: "-0.1px",
              }}
            >
              Start free trial — no credit card
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CSS: hide on desktop ── */}
      <style>{`
        @media (min-width: 768px) {
          .mobile-cta-bar {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
