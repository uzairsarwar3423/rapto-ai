"use client";

/**
 * WaitlistModal.tsx
 * Overlay modal containing the waitlist form.
 * Glassmorphism backdrop, focus-trap, keyboard dismiss (Escape),
 * and smooth enter/exit animations via Framer Motion.
 *
 * Mount once in the root layout. Open/close via useWaitlistModal or
 * the openWaitlistModal() / closeWaitlistModal() helpers.
 */

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { useWaitlistModal } from "@/hooks/marketing/useWaitlistModal";
import { WaitlistForm } from "@/components/marketing/ui/WaitlistForm";

export function WaitlistModal() {
  const { isOpen, close } = useWaitlistModal();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ─────────────────────────────────────── */}
          <motion.div
            key="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="waitlist-backdrop"
            aria-hidden="true"
          />

          {/* ── Centering wrapper (flexbox — avoids transform conflict) ── */}
          <div className="waitlist-positioner">
            <motion.div
              key="modal-panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Join the Vocaply waitlist"
              initial={{ opacity: 0, scale: 0.94, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: "spring", stiffness: 360, damping: 28, mass: 0.8 }}
              className="waitlist-panel"
            >
            {/* ── Modal Header ─────────────────────────────── */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "24px 24px 0",
              }}
            >
              <div>
                {/* Pill label */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 10px",
                    background: "#E8F5EE",
                    borderRadius: "100px",
                    marginBottom: "10px",
                  }}
                >
                  <Sparkles size={11} style={{ color: "#1A6B3C" }} />
                  <span
                    style={{
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#1A6B3C",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    Early access
                  </span>
                </div>

                <h2
                  style={{
                    fontFamily: "var(--font-serif, Georgia, serif)",
                    fontSize: "22px",
                    fontWeight: 400,
                    color: "#0A0A0A",
                    letterSpacing: "-0.5px",
                    lineHeight: 1.2,
                  }}
                >
                  Join the waitlist
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-sans, system-ui)",
                    fontSize: "13.5px",
                    color: "#6B6A67",
                    lineHeight: 1.5,
                    marginTop: "4px",
                  }}
                >
                  We&apos;re onboarding teams in batches. Get early access +&nbsp;3 months free.
                </p>
              </div>

              {/* Close button */}
              <button
                onClick={close}
                aria-label="Close modal"
                style={{
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#F2F1EE",
                  border: "none",
                  borderRadius: "50%",
                  cursor: "pointer",
                  color: "#6B6A67",
                  flexShrink: 0,
                  marginLeft: "12px",
                  marginTop: "4px",
                  transition: "background 150ms ease, color 150ms ease",
                }}
                className="modal-close-btn"
              >
                <X size={16} />
              </button>
            </div>

            {/* Divider */}
            <div
              style={{
                height: "1px",
                background: "#E4E3DF",
                margin: "20px 24px 0",
              }}
            />

            {/* ── Form ─────────────────────────────────────── */}
            <div style={{ padding: "20px 24px 28px" }}>
              <WaitlistForm compact onSuccess={close} />
            </div>
          </motion.div>
        </div>

          <style>{`
            /* ── Backdrop ─────────────────────────── */
            .waitlist-backdrop {
              position: fixed;
              inset: 0;
              background: rgba(10,10,10,0.65);
              backdrop-filter: blur(6px);
              -webkit-backdrop-filter: blur(6px);
              z-index: 500;
            }

            /* ── Positioner — centres the panel via flexbox ── */
            .waitlist-positioner {
              position: fixed;
              inset: 0;
              z-index: 501;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 16px;
              box-sizing: border-box;
              pointer-events: none;      /* clicks fall through to backdrop */
            }

            /* ── Panel ───────────────────────────── */
            .waitlist-panel {
              pointer-events: all;       /* re-enable clicks on the panel */
              width: 100%;
              max-width: 500px;
              max-height: calc(100dvh - 32px);
              overflow-y: auto;
              background: #FAFAF8;
              border-radius: 14px;
              border: 1px solid #E4E3DF;
              box-shadow: 0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08);
              box-sizing: border-box;
            }

            /* ── Tablet ≤ 600px — slightly tighter ── */
            @media (max-width: 600px) {
              .waitlist-positioner {
                align-items: flex-end;
                padding: 0;
              }
              .waitlist-panel {
                max-width: 100%;
                border-radius: 18px 18px 0 0;
                max-height: 92dvh;
              }
            }

            /* ── Close button hover ───────────────── */
            .modal-close-btn:hover {
              background: #E4E3DF !important;
              color: #0A0A0A !important;
            }
          `}</style>
        </>
      )}
    </AnimatePresence>
  );
}
