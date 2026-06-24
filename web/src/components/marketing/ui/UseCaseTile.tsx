"use client";

/**
 * UseCaseTile.tsx
 * Tile for the UseCases 2×2 grid.
 * White card on gray-1 bg. Lucide icon in green rounded square.
 * Integration tags as mini chips.
 */

import { useState } from "react";
import {
  Mic,
  GitPullRequest,
  Handshake,
  Megaphone,
  Users,
  Calendar,
  MessageSquare,
  type LucideProps,
} from "lucide-react";
import type { UseCaseTileData } from "@/lib/marketing/content/usecases.content";

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Mic,
  GitPullRequest,
  Handshake,
  Megaphone,
  Users,
  Calendar,
  MessageSquare,
};

interface UseCaseTileProps {
  data: UseCaseTileData;
}

export function UseCaseTile({ data }: UseCaseTileProps) {
  const [hovered, setHovered] = useState(false);
  const IconComponent = ICON_MAP[data.iconName] ?? Mic;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "white",
        borderRadius: "14px",
        padding: "32px",
        border: `1.5px solid ${hovered ? "#C5E0CC" : "#E4E3DF"}`,
        boxShadow: hovered
          ? "0 8px 28px rgba(26,107,60,0.08)"
          : "0 1px 3px rgba(0,0,0,0.04)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition: "box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease",
      }}
    >
      {/* Icon in green rounded square */}
      <div
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "12px",
          background: hovered
            ? "linear-gradient(135deg, #D8F0E0 0%, #C5E4CF 100%)"
            : "linear-gradient(135deg, #EBF6EF 0%, #D8EFE1 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "18px",
          transition: "background 200ms ease",
        }}
      >
        <IconComponent size={20} strokeWidth={1.75} color="#1A6B3C" />
      </div>

      {/* Title */}
      <h3
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "16px",
          fontWeight: 600,
          color: "#0A0A0A",
          marginBottom: "8px",
          letterSpacing: "-0.2px",
          lineHeight: 1.3,
        }}
      >
        {data.title}
      </h3>

      {/* Caption */}
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "14px",
          color: "#6B6A67",
          lineHeight: 1.6,
          marginBottom: "20px",
        }}
      >
        {data.caption}
      </p>

      {/* Integration tags */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {data.integrationTags.map((tag) => (
          <span
            key={tag}
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "11px",
              fontWeight: 500,
              color: "#6B6A67",
              background: "#F2F1EE",
              borderRadius: "5px",
              padding: "3px 9px",
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
