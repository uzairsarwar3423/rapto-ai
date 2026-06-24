import type { Variants } from "framer-motion";

/**
 * Shared Framer Motion animation variants
 * Used across all marketing sections (Day 4 onwards)
 *
 * Usage:
 *   <motion.div variants={containerVariant} initial="hidden" animate={isVisible ? "visible" : "hidden"}>
 *     <motion.div variants={cardVariant}>...</motion.div>
 *   </motion.div>
 */

// ── Fade up: element slides up 20px and fades in ─────────────
export const fadeUpVariant: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

// ── Container: staggers children with 150ms delay ────────────
export const containerVariant: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0,
    },
  },
};

// ── Card variant (same as fadeUp, aliased for semantics) ─────
export const cardVariant: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

// ── Fast fade (for UI elements like badges, labels) ──────────
export const fastFadeVariant: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
};

// ── Slide in from left ───────────────────────────────────────
export const slideInLeftVariant: Variants = {
  hidden: {
    opacity: 0,
    x: -24,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

// ── Slide in from right ──────────────────────────────────────
export const slideInRightVariant: Variants = {
  hidden: {
    opacity: 0,
    x: 24,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

// ── Scale in (for modal/overlay entries) ─────────────────────
export const scaleInVariant: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
};

// ── Tab content switcher (AnimatePresence) ───────────────────
export const tabExitVariant: Variants = {
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15 },
  },
};

export const tabEnterVariant: Variants = {
  hidden: {
    opacity: 0,
    y: 8,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      delay: 0.05,
    },
  },
};
