/**
 * FeatureCard.tsx
 * Individual feature card for the FeaturesGrid section.
 * Renders Lucide React icon based on string name.
 * Features hover shadow + border colors and stagger animations.
 */

import { motion } from "framer-motion";
import * as Lucide from "lucide-react";
import { cardVariant } from "@/lib/marketing/animations";

interface FeatureCardProps {
  iconName: string;
  title: string;
  description: string;
}

export function FeatureCard({ iconName, title, description }: FeatureCardProps) {
  const IconComponent = (Lucide as any)[iconName];

  return (
    <motion.div
      variants={cardVariant}
      className="feature-card"
      style={{
        background: "#FFFFFF",
        border: "1px solid #E4E3DF",
        borderRadius: "10px",
        padding: "32px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        boxSizing: "border-box",
        transition: "border-color 200ms ease, box-shadow 200ms ease",
      }}
    >
      {/* Icon Area */}
      <div
        style={{
          color: "#1A6B3C",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          height: "28px",
        }}
      >
        {IconComponent && <IconComponent size={28} />}
      </div>

      {/* Title */}
      <h3
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "17px",
          fontWeight: 600,
          color: "#0A0A0A",
          marginBottom: "8px",
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
        .feature-card:hover {
          border-color: #1A6B3C !important;
          box-shadow: 0 4px 24px rgba(26,107,60,0.08) !important;
        }

        @media (max-width: 768px) {
          .feature-card {
            padding: 24px !important;
          }
        }
      `}</style>
    </motion.div>
  );
}
