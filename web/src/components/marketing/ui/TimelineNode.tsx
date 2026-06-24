"use client";

/**
 * TimelineNode.tsx
 * Single node in the WorkflowTimeline section.
 *
 * Desktop: 3-column grid — timestamp | dot-on-line | content
 *           Odd nodes  → timestamp LEFT, content RIGHT
 *           Even nodes → content LEFT, timestamp RIGHT
 * Mobile:  Line on left, timestamp above title, content to right of dot.
 *
 * Callouts are rendered via the `callout` prop (passed from WorkflowTimeline).
 */

import type { ReactNode } from "react";

interface TimelineNodeProps {
  timestamp: string;
  title: string;
  description: string;
  isEven: boolean;          // true = even index (0-based: 1, 3)
  callout: ReactNode;
}

export function TimelineNode({
  timestamp,
  title,
  description,
  isEven,
  callout,
}: TimelineNodeProps) {
  const timestampEl = (
    <div
      style={{
        fontFamily: "var(--font-sans, system-ui)",
        fontSize: "12px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "#9B9A96",
        paddingTop: "2px",
        textAlign: isEven ? "left" : "right",
        // Mobile: full-width above content
      }}
    >
      {timestamp}
    </div>
  );

  const contentEl = (
    <div>
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "15px",
          fontWeight: 600,
          color: "#0A0A0A",
          marginBottom: "6px",
          lineHeight: 1.4,
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "14px",
          color: "#6B6A67",
          lineHeight: 1.6,
          marginBottom: callout ? "12px" : "0",
        }}
      >
        {description}
      </p>
      {callout && <div>{callout}</div>}
    </div>
  );

  return (
    <>
      {/* ── Desktop layout (≥768px) ── */}
      <div
        className="timeline-node-desktop"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 40px 1fr",
          gap: "0 16px",
          alignItems: "flex-start",
          marginBottom: "48px",
          position: "relative",
        }}
      >
        {/* Col 1 */}
        <div style={{ paddingTop: "4px" }}>
          {!isEven ? timestampEl : contentEl}
        </div>

        {/* Col 2 — center dot */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: "4px",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              background: "white",
              border: "2px solid #1A6B3C",
              flexShrink: 0,
              zIndex: 2,
              position: "relative",
            }}
          />
        </div>

        {/* Col 3 */}
        <div style={{ paddingTop: "4px" }}>
          {isEven ? timestampEl : contentEl}
        </div>
      </div>

      {/* ── Mobile layout (<768px) ── */}
      <div
        className="timeline-node-mobile"
        style={{
          display: "none",      // shown via CSS at <768px
          flexDirection: "row",
          gap: "16px",
          alignItems: "flex-start",
          marginBottom: "40px",
        }}
      >
        {/* Mobile dot */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            flexShrink: 0,
            paddingTop: "4px",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              background: "white",
              border: "2px solid #1A6B3C",
              zIndex: 2,
              position: "relative",
            }}
          />
        </div>

        {/* Mobile content (timestamp above title) */}
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#9B9A96",
              marginBottom: "4px",
            }}
          >
            {timestamp}
          </p>
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "15px",
              fontWeight: 600,
              color: "#0A0A0A",
              marginBottom: "6px",
              lineHeight: 1.4,
            }}
          >
            {title}
          </p>
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "14px",
              color: "#6B6A67",
              lineHeight: 1.6,
              marginBottom: callout ? "12px" : "0",
            }}
          >
            {description}
          </p>
          {callout && <div>{callout}</div>}
        </div>
      </div>
    </>
  );
}
