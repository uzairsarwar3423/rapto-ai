"use client";

import Link from "next/link";
import { LogoIcon } from "@/components/ui/LogoIcon";
import { motion, AnimatePresence } from "framer-motion";
import { useNavScroll } from "@/hooks/marketing/useNavScroll";
import { useMobileMenu } from "@/hooks/marketing/useMobileMenu";
import { useMediaQuery } from "@/hooks/shared/useMediaQuery";
import { MobileMenuDrawer } from "./MobileMenuDrawer";
import { navConfig } from "@/lib/marketing/content/navigation.content";
import { openWaitlistModal } from "@/hooks/marketing/useWaitlistModal";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * MarketingNav — Premium SaaS Navigation
 * - Transparent full-width at top
 * - Shrinks into a floating frosted glass pill on scroll
 * - Modern typography, hover states, and smooth transitions
 */
export function MarketingNav() {
  const { isScrolled } = useNavScroll();
  const { isOpen, open, close, toggle } = useMobileMenu();
  const isMobile = useMediaQuery("(max-width: 768px)");

  return (
    <>
      <motion.header
        id="marketing-nav"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "fixed top-0 inset-x-0 z-[100] flex justify-center transition-all duration-500 ease-out",
          isScrolled ? "pt-4 md:pt-6 px-4" : "pt-0 px-0"
        )}
      >
        <motion.div
          layout
          className={cn(
            "flex items-center justify-between transition-all duration-500 ease-out w-full",
            isScrolled
              ? "max-w-5xl bg-white/70 dark:bg-black/70 backdrop-blur-xl border border-black/5 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(255,255,255,0.02)] rounded-full px-4 md:px-6 py-2.5 md:py-3"
              : "max-w-7xl bg-transparent border-transparent px-6 md:px-10 py-5 md:py-6"
          )}
        >
          {/* ── Logo ──────────────────────────────────────────── */}
          <Link
            href="/"
            className="flex-shrink-0 flex items-center gap-2 group outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 rounded-lg transition-transform active:scale-95"
            aria-label="Rapto home"
          >
            <LogoIcon size={isScrolled ? 60 : 70} priority />
          </Link>

          {/* ── Desktop nav links ──────────────────────────────── */}
          {!isMobile && (
            <nav aria-label="Main navigation" className="hidden md:block">
              <ul className="flex items-center gap-1.5">
                {navConfig.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "relative px-4 py-2 text-sm font-medium transition-all duration-200 rounded-full outline-none",
                        "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100",
                        "hover:bg-neutral-100/80 dark:hover:bg-neutral-800/50",
                        "focus-visible:ring-2 focus-visible:ring-neutral-400"
                      )}
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
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={openWaitlistModal}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-all duration-200 rounded-full outline-none cursor-pointer",
                  "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100",
                  "focus-visible:ring-2 focus-visible:ring-neutral-400"
                )}
              >
                Sign in
              </button>

              <button
                onClick={() => {
                  analytics.navCTAClick();
                  openWaitlistModal();
                }}
                id="nav-cta-button"
                className={cn(
                  "group relative inline-flex items-center justify-center overflow-hidden rounded-full cursor-pointer outline-none",
                  "bg-neutral-950 dark:bg-white text-white dark:text-neutral-950",
                  "px-5 py-2.5 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.1)]",
                  "transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]",
                  "focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2"
                )}
              >
                <span className="absolute inset-0 rounded-full border border-white/10 dark:border-black/10"></span>
                <span className="absolute -top-px left-1/2 -ml-[40%] w-[80%] h-px bg-gradient-to-r from-transparent via-white/40 dark:via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                <span className="relative flex items-center gap-1.5">
                  Start free trial
                  <svg 
                    className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor" 
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
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
              className={cn(
                "relative z-50 flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-full transition-colors outline-none",
                "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                "focus-visible:ring-2 focus-visible:ring-neutral-400"
              )}
            >
              <span
                className={cn(
                  "h-[1.5px] w-5 bg-neutral-900 dark:bg-white transition-transform duration-300 ease-out origin-center",
                  isOpen ? "translate-y-[7.5px] rotate-45" : ""
                )}
              />
              <span
                className={cn(
                  "h-[1.5px] w-5 bg-neutral-900 dark:bg-white transition-opacity duration-300 ease-out",
                  isOpen ? "opacity-0" : ""
                )}
              />
              <span
                className={cn(
                  "h-[1.5px] w-5 bg-neutral-900 dark:bg-white transition-transform duration-300 ease-out origin-center",
                  isOpen ? "-translate-y-[7.5px] -rotate-45" : ""
                )}
              />
            </button>
          )}
        </motion.div>
      </motion.header>

      {/* Mobile drawer — rendered outside header so it covers full screen */}
      <MobileMenuDrawer isOpen={isOpen} onClose={close} />
    </>
  );
}

