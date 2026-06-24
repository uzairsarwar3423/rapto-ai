"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useAnnouncementBar } from "@/hooks/marketing/useAnnouncementBar";
import { heroContent } from "@/lib/marketing/content/hero.content";

/**
 * AnnouncementBar — Dismissible full-width green banner above the nav.
 * - Smooth height collapse on dismiss (CSS transition)
 * - Persists dismissed state in localStorage
 */
export function AnnouncementBar() {
  const { isVisible, dismiss } = useAnnouncementBar();

  return (
    <motion.div
      id="announcement-bar"
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: isVisible ? 1 : 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{
        overflow: "hidden",
        maxHeight: isVisible ? "60px" : "0px",
        transition: "max-height 300ms ease",
      }}
      aria-hidden={!isVisible}
    >
      <div
        style={{
          height: "40px",
          background: "#E8F5EE",
          borderBottom: "1px solid rgba(26,107,60,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 48px",
        }}
      >
        {/* Content */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            color: "#1A6B3C",
            whiteSpace: "nowrap",
          }}
        >
          <span aria-hidden="true">✨</span>
          <span>{heroContent.announcementText}</span>
          <Link
            href={heroContent.announcementLinkHref}
            style={{
              color: "#1A6B3C",
              textDecoration: "underline",
              textDecorationColor: "rgba(26,107,60,0.4)",
              marginLeft: "4px",
              transition: "opacity 150ms ease",
            }}
            className="hover:opacity-70"
          >
            {heroContent.announcementLinkText}
          </Link>
        </div>

        {/* Dismiss button */}
        <button
          onClick={dismiss}
          aria-label="Dismiss announcement"
          style={{
            position: "absolute",
            right: "16px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#1A6B3C",
            fontSize: "16px",
            borderRadius: "4px",
            transition: "opacity 150ms ease",
          }}
          className="hover:opacity-60"
        >
          ×
        </button>
      </div>
    </motion.div>
  );
}
