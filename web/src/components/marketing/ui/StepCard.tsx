/**
 * StepCard.tsx
 * Numbered card component for the 3-step 'How It Works' section.
 * Features smooth micro-animations, green-tinted icon box, and large serif number.
 */

import { motion } from "framer-motion";
import * as Lucide from "lucide-react";
import { cardVariant } from "@/lib/marketing/animations";

interface StepCardProps {
  number: string;
  iconName: string;
  title: string;
  description: string;
}

export function StepCard({ number, iconName, title, description }: StepCardProps) {
  const IconComponent = (Lucide as any)[iconName];

  return (
    <motion.div
      variants={cardVariant}
      className="step-card"
      style={{
        background: "#FFFFFF",
        padding: "36px 32px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        boxSizing: "border-box",
        transition: "transform 200ms ease, box-shadow 200ms ease",
      }}
    >
      {/* Large background number */}
      <span
        style={{
          fontFamily: "var(--font-serif, Georgia, serif)",
          fontStyle: "italic",
          fontSize: "48px",
          color: "#E4E3DF",
          lineHeight: 1,
          marginBottom: "16px",
          userSelect: "none",
          display: "block",
        }}
      >
        {number}
      </span>

      {/* Icon Box */}
      <div
        style={{
          width: "44px",
          height: "44px",
          background: "#E8F5EE", // accent-light
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "20px",
          flexShrink: 0,
        }}
      >
        {IconComponent && (
          <IconComponent size={20} style={{ color: "#1A6B3C" }} />
        )}
      </div>

      {/* Title */}
      <h3
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "17px",
          fontWeight: 600,
          color: "#0A0A0A",
          marginBottom: "10px",
          letterSpacing: "-0.3px",
          lineHeight: 1.3,
        }}
      >
        {title}
      </h3>

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
        {description}
      </p>

      <style>{`
        .step-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.03);
          z-index: 2;
        }

        @media (max-width: 768px) {
          .step-card {
            padding: 28px 24px !important;
          }
        }
      `}</style>
    </motion.div>
  );
}
