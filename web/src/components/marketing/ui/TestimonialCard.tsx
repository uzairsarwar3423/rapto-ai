"use client";

/**
 * TestimonialCard.tsx
 * Quote card for Testimonials section.
 * Instrument Serif italic quote with bold phrase highlight.
 * Hover: green outline via box-shadow.
 */

import { useState } from "react";
import type { TestimonialData } from "@/lib/marketing/content/testimonials.content";

interface TestimonialCardProps {
  data: TestimonialData;
}

/** Renders quote text, bolding the `boldPhrase` substring */
function QuoteText({ quote, boldPhrase }: { quote: string; boldPhrase: string }) {
  if (!boldPhrase || !quote.includes(boldPhrase)) {
    return <>{quote}</>;
  }
  const [before, after] = quote.split(boldPhrase);
  return (
    <>
      {before}
      <strong style={{ fontWeight: 600, fontStyle: "italic" }}>{boldPhrase}</strong>
      {after}
    </>
  );
}

export function TestimonialCard({ data }: TestimonialCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "white",
        border: "1px solid #E4E3DF",
        borderRadius: "12px",
        padding: "28px",
        display: "flex",
        flexDirection: "column",
        boxShadow: hovered
          ? "0 0 0 1.5px #1A6B3C"
          : "0 1px 4px rgba(0,0,0,0.04)",
        transition: "box-shadow 200ms ease",
      }}
    >
      {/* Stars */}
      <div
        style={{ display: "flex", gap: "3px", marginBottom: "16px" }}
        aria-label="5 stars"
      >
        {[1, 2, 3, 4, 5].map((s) => (
          <span
            key={s}
            aria-hidden="true"
            style={{ color: "#F5A623", fontSize: "14px" }}
          >
            ★
          </span>
        ))}
      </div>

      {/* Quote */}
      <blockquote
        style={{
          fontFamily: "var(--font-serif, Georgia, serif)",
          fontSize: "15px",
          fontStyle: "italic",
          color: "#0A0A0A",
          lineHeight: 1.75,
          margin: "0 0 auto",
          padding: 0,
          border: "none",
          flex: 1,
        }}
      >
        <QuoteText quote={data.quote} boldPhrase={data.boldPhrase} />
      </blockquote>

      {/* Author */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginTop: "20px",
          paddingTop: "20px",
          borderTop: "1px solid #F2F1EE",
        }}
      >
        {/* Avatar initials circle */}
        <div
          aria-hidden="true"
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #E8F5EE 0%, #D1EAD9 100%)",
            border: "1px solid #C5E0CC",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "12px",
              fontWeight: 700,
              color: "#1A6B3C",
              letterSpacing: "0.02em",
            }}
          >
            {data.initials}
          </span>
        </div>

        {/* Name + role */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "13px",
              fontWeight: 600,
              color: "#0A0A0A",
              marginBottom: "2px",
            }}
          >
            {data.authorName}
          </p>
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "12px",
              color: "#9B9A96",
            }}
          >
            {data.authorRole} · {data.authorCompany}
          </p>
        </div>
      </div>
    </div>
  );
}
