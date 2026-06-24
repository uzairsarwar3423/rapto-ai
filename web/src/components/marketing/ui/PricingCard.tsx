"use client";

/**
 * PricingCard.tsx
 * Premium pricing tier card with full responsive support.
 *
 * Popular (Growth) card: dark bg (#0A0A0A), white text, stands out visually.
 * Others: white bg, dark text.
 * CTA: all cards → green fill on hover.
 * Price: smooth opacity fade when toggle switches.
 */

import { useState } from "react";
import { Check, Zap } from "lucide-react";
import type { PricingPlan } from "@/lib/marketing/content/pricing.content";
import { analytics } from "@/lib/analytics";

interface PricingCardProps {
  plan: PricingPlan;
  isAnnual: boolean;
}

export function PricingCard({ plan, isAnnual }: PricingCardProps) {
  const [ctaHovered, setCtaHovered] = useState(false);
  const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
  const isFree = plan.monthlyPrice === 0;
  const isPopular = plan.isPopular;

  return (
    <div
      style={{
        background: isPopular ? "#0A0A0A" : "white",
        border: isPopular ? "none" : "1.5px solid #E4E3DF",
        borderRadius: "16px",
        padding: "clamp(20px, 2.5vw, 28px) clamp(18px, 2vw, 24px)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        boxShadow: isPopular
          ? "0 20px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.12)"
          : "0 1px 4px rgba(0,0,0,0.04)",
        /* Slightly taller to make it visually "lifted" */
        marginTop: isPopular ? "-8px" : "0",
        marginBottom: isPopular ? "-8px" : "0",
      }}
    >
      {/* Most Popular badge */}
      {isPopular && (
        <div
          style={{
            position: "absolute",
            top: "-14px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1A6B3C",
            color: "white",
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 14px",
            borderRadius: "100px",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Zap size={9} strokeWidth={2.5} color="white" />
          Most Popular
        </div>
      )}

      {/* Plan name */}
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: isPopular ? "rgba(255,255,255,0.45)" : "#9B9A96",
          marginBottom: "14px",
        }}
      >
        {plan.name}
      </p>

      {/* Price */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "4px",
          marginBottom: "4px",
          transition: "opacity 150ms ease",
        }}
      >
        {!isFree && (
          <span
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "18px",
              fontWeight: 400,
              color: isPopular ? "rgba(255,255,255,0.5)" : "#9B9A96",
              alignSelf: "flex-start",
              marginTop: "8px",
            }}
          >
            $
          </span>
        )}
        <span
          style={{
            fontFamily: "var(--font-serif, Georgia, serif)",
            fontSize: "clamp(38px, 4vw, 52px)",
            fontWeight: 400,
            color: isPopular ? "white" : "#0A0A0A",
            letterSpacing: "-2px",
            lineHeight: 1.0,
          }}
        >
          {isFree ? "Free" : price}
        </span>
        {!isFree && (
          <span
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "12px",
              color: isPopular ? "rgba(255,255,255,0.4)" : "#9B9A96",
              paddingBottom: "6px",
            }}
          >
            / mo
          </span>
        )}
      </div>

      {/* Annual billing note — always occupies space, content fades */}
      <div style={{ minHeight: "20px", marginBottom: "14px" }}>
        {isAnnual && !isFree ? (
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "11px",
              color: isPopular ? "#6ECC8E" : "#1A6B3C",
              fontWeight: 500,
            }}
          >
            ${plan.annualBilledAs} billed annually · save 20%
          </p>
        ) : isFree ? (
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "11px",
              color: isPopular ? "rgba(255,255,255,0.4)" : "#9B9A96",
            }}
          >
            No credit card needed
          </p>
        ) : (
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "11px",
              color: isPopular ? "rgba(255,255,255,0.3)" : "#C0BFB9",
            }}
          >
            &nbsp;
          </p>
        )}
      </div>

      {/* Divider */}
      <div
        style={{
          height: "1px",
          background: isPopular ? "rgba(255,255,255,0.1)" : "#F0EFEB",
          marginBottom: "16px",
        }}
      />

      {/* Limits */}
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "12px",
          fontWeight: 500,
          color: isPopular ? "#6ECC8E" : "#1A6B3C",
          marginBottom: "16px",
          lineHeight: 1.5,
        }}
      >
        {plan.memberLimit}
        <br />
        <span style={{ opacity: 0.8 }}>{plan.meetingLimit}</span>
      </p>

      {/* Feature list */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "9px",
        }}
      >
        {plan.features.map((feature, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "flex-start",
            }}
          >
            <Check
              size={13}
              strokeWidth={2.5}
              color={isPopular ? "#6ECC8E" : "#1A6B3C"}
              style={{ flexShrink: 0, marginTop: "2px" }}
            />
            <span
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "13px",
                color: isPopular ? "rgba(255,255,255,0.65)" : "#6B6A67",
                lineHeight: 1.55,
              }}
            >
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onMouseEnter={() => setCtaHovered(true)}
        onMouseLeave={() => setCtaHovered(false)}
        onClick={() => {
          analytics.pricingPlanClick(plan.name.toLowerCase() as any);
          window.location.href = plan.ctaHref;
        }}
        style={{
          marginTop: "24px",
          width: "100%",
          padding: "12px 20px",
          borderRadius: "9px",
          border: isPopular
            ? "none"
            : `1.5px solid ${ctaHovered ? "#1A6B3C" : "#D4D3CF"}`,
          background: isPopular
            ? ctaHovered ? "#1A6B3C" : "#1F1F1F"
            : ctaHovered ? "#1A6B3C" : "white",
          color: isPopular
            ? "white"
            : ctaHovered ? "white" : "#0A0A0A",
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "14px",
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 200ms ease, color 200ms ease, border-color 200ms ease",
          letterSpacing: "-0.1px",
        }}
      >
        {plan.ctaText}
      </button>
    </div>
  );
}
