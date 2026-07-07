"use client";

import Link from "next/link";
import { LogoIcon } from "@/components/ui/LogoIcon";
import { motion } from "framer-motion";
import { useNavScroll } from "@/hooks/marketing/useNavScroll";
import { useMobileMenu } from "@/hooks/marketing/useMobileMenu";
import { useMediaQuery } from "@/hooks/shared/useMediaQuery";
import { MobileMenuDrawer } from "./MobileMenuDrawer";
import { navConfig } from "@/lib/marketing/content/navigation.content";
import { openWaitlistModal } from "@/hooks/marketing/useWaitlistModal";
import { analytics } from "@/lib/analytics";

/**
 * MarketingNav — Sticky top navigation.
 * - Transparent at top, frosted glass after 10px scroll
 * - Desktop: logo + 5 links + sign-in + trial button
 * - Mobile: logo + hamburger icon → MobileMenuDrawer
 */
export function MarketingNav() {
  const { isScrolled } = useNavScroll();
  const { isOpen, open, close, toggle } = useMobileMenu();
  const isMobile = useMediaQuery("(max-width: 768px)");

  return (
    <>
      <motion.header
        id="marketing-nav"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.25, ease: "easeOut" }}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: "68px",
          background: isScrolled
            ? "rgba(250,250,248,0.95)"
            : "rgba(250,250,248,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: isScrolled
            ? "1px solid #E4E3DF"
            : "1px solid transparent",
          transition: "border-color 200ms ease, background 200ms ease",
        }}
      >
        <div
          style={{
            maxWidth: "1120px",
            margin: "0 auto",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 var(--pad)",
          }}
        >
          {/* ── Logo ──────────────────────────────────────────── */}
          <Link
            href="/"
            style={{ textDecoration: "none", flexShrink: 0, display: "inline-flex", alignItems: "center" }}
            aria-label="Rapto home"
          >
            <LogoIcon size={70} priority />
          </Link>

          {/* ── Desktop nav links ──────────────────────────────── */}
          {!isMobile && (
            <nav aria-label="Main navigation">
              <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "32px",
                }}
              >
                {navConfig.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "14px",
                        fontWeight: 400,
                        color: "#6B6A67",
                        textDecoration: "none",
                        transition: "color 150ms ease",
                      }}
                      className="hover:text-black"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* ── Desktop right actions ──────────────────────────── */}
          {!isMobile && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "24px",
              }}
            >
              <button
                onClick={openWaitlistModal}
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "14px",
                  fontWeight: 400,
                  color: "#6B6A67",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  transition: "color 150ms ease",
                }}
                className="hover:text-black"
              >
                Sign in
              </button>

              <button
                onClick={() => {
                  analytics.navCTAClick();
                  openWaitlistModal();
                }}
                id="nav-cta-button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 18px",
                  background: "#0A0A0A",
                  color: "#FAFAF8",
                  fontFamily: "var(--font-sans)",
                  fontSize: "14px",
                  fontWeight: 500,
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 200ms ease, transform 200ms ease",
                  whiteSpace: "nowrap",
                }}
                className="hover:bg-accent hover:-translate-y-px"
              >
                Start free trial
              </button>
            </div>
          )}

          {/* ── Mobile hamburger ───────────────────────────────── */}
          {isMobile && (
            <button
              onClick={toggle}
              aria-label={isOpen ? "Close menu" : "Open menu"}
              aria-expanded={isOpen}
              aria-controls="mobile-menu-drawer"
              style={{
                width: "40px",
                height: "40px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: isOpen ? "0px" : "5px",
                background: "none",
                border: "none",
                cursor: "pointer",
                borderRadius: "6px",
                padding: "8px",
              }}
            >
              {/* Hamburger lines — animate to X */}
              <span
                style={{
                  display: "block",
                  width: "20px",
                  height: "2px",
                  background: "#0A0A0A",
                  borderRadius: "2px",
                  transition: "transform 250ms ease, opacity 200ms ease",
                  transform: isOpen ? "rotate(45deg) translateY(2px)" : "none",
                }}
              />
              <span
                style={{
                  display: "block",
                  width: "20px",
                  height: "2px",
                  background: "#0A0A0A",
                  borderRadius: "2px",
                  transition: "opacity 200ms ease",
                  opacity: isOpen ? 0 : 1,
                }}
              />
              <span
                style={{
                  display: "block",
                  width: "20px",
                  height: "2px",
                  background: "#0A0A0A",
                  borderRadius: "2px",
                  transition: "transform 250ms ease, opacity 200ms ease",
                  transform: isOpen ? "rotate(-45deg) translateY(-2px)" : "none",
                }}
              />
            </button>
          )}
        </div>
      </motion.header>

      {/* Mobile drawer — rendered outside header so it covers full screen */}
      <MobileMenuDrawer isOpen={isOpen} onClose={close} />
    </>
  );
}
