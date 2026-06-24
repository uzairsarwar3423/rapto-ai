"use client";

/**
 * SecurityCard.tsx
 * Individual security claim card for SecuritySection.
 * Gray-1 bg. Lucide icon in green-tinted square.
 */

import {
  Lock,
  ShieldOff,
  FileCheck,
  BadgeCheck,
  Shield,
  Eye,
  type LucideProps,
} from "lucide-react";
import type { SecurityClaim } from "@/lib/marketing/content/security.content";

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Lock,
  ShieldOff,
  FileCheck,
  BadgeCheck,
  Shield,
  Eye,
};

export function SecurityCard({ claim }: { claim: SecurityClaim }) {
  const IconComponent = ICON_MAP[claim.iconName] ?? Lock;

  return (
    <div
      style={{
        background: "#F2F1EE",
        borderRadius: "12px",
        padding: "28px",
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: "42px",
          height: "42px",
          borderRadius: "10px",
          background: "#E8F5EE",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "16px",
        }}
      >
        <IconComponent size={19} strokeWidth={1.75} color="#1A6B3C" />
      </div>

      {/* Title */}
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "15px",
          fontWeight: 600,
          color: "#0A0A0A",
          marginBottom: "8px",
          lineHeight: 1.3,
        }}
      >
        {claim.title}
      </p>

      {/* Description */}
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "14px",
          color: "#6B6A67",
          lineHeight: 1.65,
          margin: 0,
        }}
      >
        {claim.description}
      </p>

      {/* Optional italic note (SOC 2 in progress) */}
      {claim.hasNote && (
        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "12px",
            fontStyle: "italic",
            color: "#9B9A96",
            marginTop: "8px",
          }}
        >
          {claim.hasNote}
        </p>
      )}
    </div>
  );
}
