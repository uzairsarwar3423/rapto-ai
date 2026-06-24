"use client";

/**
 * RoleCard.tsx
 * Card for BenefitsByRole — one per persona.
 *
 * Renders a lucide-react icon in a small green-tinted pill above the headline.
 * Hover: lift + shadow. CTA arrow animates.
 */

import { useState } from "react";
import {
  Users,
  Layers,
  Rocket,
  BarChart2,
  Settings,
  Bell,
  CheckCircle,
  Zap,
  MessageSquare,
  Calendar,
  type LucideProps,
} from "lucide-react";
import type { RoleCardData } from "@/lib/marketing/content/benefits.content";

// Map from icon name string → Lucide component
const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Users,
  Layers,
  Rocket,
  BarChart2,
  Settings,
  Bell,
  CheckCircle,
  Zap,
  MessageSquare,
  Calendar,
};

interface RoleCardProps {
  data: RoleCardData;
}

export function RoleCard({ data }: RoleCardProps) {
  const [hovered, setHovered] = useState(false);
  const [ctaHovered, setCtaHovered] = useState(false);

  const IconComponent = ICON_MAP[data.iconName] ?? Users;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "white",
        border: `1.5px solid ${hovered ? "#C5E0CC" : "#E4E3DF"}`,
        borderRadius: "14px",
        padding: "32px",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 12px 32px rgba(26,107,60,0.08), 0 2px 8px rgba(0,0,0,0.04)"
          : "0 1px 4px rgba(0,0,0,0.04)",
        transition: "transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease",
      }}
    >
      {/* Icon pill */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "10px",
            background: hovered
              ? "linear-gradient(135deg, #D8F0E0 0%, #C5E4CF 100%)"
              : "linear-gradient(135deg, #EBF6EF 0%, #D8EFE1 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 220ms ease",
            flexShrink: 0,
          }}
        >
          <IconComponent
            size={18}
            strokeWidth={1.75}
            color="#1A6B3C"
          />
        </div>

        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#9B9A96",
            margin: 0,
          }}
        >
          {data.roleLabel}
        </p>
      </div>

      {/* Headline */}
      <h3
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "17px",
          fontWeight: 600,
          color: "#0A0A0A",
          lineHeight: 1.35,
          letterSpacing: "-0.3px",
          marginBottom: "20px",
        }}
      >
        {data.headline}
      </h3>

      {/* Bullets */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {data.bullets.map((bullet, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-start",
            }}
          >
            <CheckCircle
              size={14}
              strokeWidth={2.5}
              color="#1A6B3C"
              style={{ flexShrink: 0, marginTop: "2px" }}
            />
            <span
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "14px",
                color: "#6B6A67",
                lineHeight: 1.55,
              }}
            >
              {bullet}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div
        style={{
          marginTop: "24px",
          paddingTop: "20px",
          borderTop: "1px solid #F2F1EE",
        }}
      >
        <a
          href={data.ctaHref}
          onMouseEnter={() => setCtaHovered(true)}
          onMouseLeave={() => setCtaHovered(false)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "14px",
            fontWeight: 500,
            color: "#1A6B3C",
            textDecoration: "none",
          }}
        >
          {data.ctaText}
          <span
            style={{
              display: "inline-block",
              transform: ctaHovered ? "translateX(4px)" : "translateX(0)",
              transition: "transform 150ms ease",
            }}
            aria-hidden="true"
          >
            →
          </span>
        </a>
      </div>
    </div>
  );
}
