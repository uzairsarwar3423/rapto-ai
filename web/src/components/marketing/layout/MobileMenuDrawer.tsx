"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useMobileMenu } from "@/hooks/marketing/useMobileMenu";
import { navConfig } from "@/lib/marketing/content/navigation.content";
import { openWaitlistModal } from "@/hooks/marketing/useWaitlistModal";

/**
 * MobileMenuDrawer — Full-screen overlay nav for mobile (<768px)
 * Triggered by the hamburger in MarketingNav.
 * Animates in from right, Escape key closes it.
 */

interface MobileMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMenuDrawer({ isOpen, onClose }: MobileMenuDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="mobile-menu-drawer"
          initial={{ opacity: 0, x: "100%" }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: "100%" }}
          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(250,250,248,0.98)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            display: "flex",
            flexDirection: "column",
            padding: "0 24px 40px",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {/* Top bar — logo + close */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: "60px",
              borderBottom: "1px solid #E4E3DF",
              marginBottom: "32px",
            }}
          >
            {/* Logo */}
            <Link href="/" onClick={onClose} style={{ textDecoration: "none", display: "inline-flex", alignItems: "baseline" }}>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(24px, 2.5vw, 30px)", fontWeight: 400, color: "#0A0A0A", letterSpacing: "-0.5px", lineHeight: 1 }}>
                voca
              </span>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(24px, 2.5vw, 30px)", fontWeight: 400, color: "#1A6B3C", letterSpacing: "-0.5px", lineHeight: 1 }}>
                ply
              </span>
            </Link>

            {/* Close button */}
            <button
              onClick={onClose}
              aria-label="Close menu"
              style={{
                width: "40px",
                height: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "22px",
                color: "#0A0A0A",
                borderRadius: "6px",
              }}
              className="hover:bg-gray-1 transition-colors duration-150"
            >
              ×
            </button>
          </div>

          {/* Nav links */}
          <nav style={{ flex: 1 }}>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }}>
              {navConfig.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onClose}
                    style={{
                      display: "block",
                      padding: "14px 0",
                      fontFamily: "var(--font-sans)",
                      fontSize: "20px",
                      fontWeight: 400,
                      color: "#0A0A0A",
                      textDecoration: "none",
                      borderBottom: "1px solid #F2F1EE",
                      transition: "color 150ms ease",
                    }}
                    className="hover:text-accent"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Bottom actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "32px" }}>
            <button
              onClick={() => { onClose(); openWaitlistModal(); }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                padding: "12px",
                fontFamily: "var(--font-sans)",
                fontSize: "15px",
                fontWeight: 400,
                color: "#6B6A67",
                background: "none",
                border: "none",
                cursor: "pointer",
                borderRadius: "6px",
                transition: "color 150ms ease",
              }}
              className="hover:text-black"
            >
              Sign in
            </button>

            <button
              onClick={() => { onClose(); openWaitlistModal(); }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                padding: "14px",
                background: "#0A0A0A",
                color: "#FAFAF8",
                fontFamily: "var(--font-sans)",
                fontSize: "15px",
                fontWeight: 500,
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                transition: "background 200ms ease",
              }}
              className="hover:bg-accent"
            >
              Start free trial
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
