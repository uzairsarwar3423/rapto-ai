"use client";

/**
 * WorkflowTimeline.tsx
 * Day 6 — Tells a week-in-the-life story showing Vocaply's accountability loop.
 *
 * Desktop: alternating left/right timeline nodes around a center vertical line.
 * Mobile:  line on left, all content to the right.
 *
 * Animations:
 *   - Vertical line: scaleY 0→1 when section enters viewport (1.2s linear)
 *   - Nodes: odd slide from left, even slide from right, 200ms stagger
 */

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { TimelineNode } from "@/components/marketing/ui/TimelineNode";
import { CommitmentRow } from "@/components/marketing/ui/CommitmentRow";
import { StatusBadge } from "@/components/marketing/ui/StatusBadge";
import { workflowSteps } from "@/lib/marketing/content/workflow.content";

// ── Mini callout renderers ────────────────────────────────────────────────────

function RecordingPill() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        background: "#FDECEA",
        borderRadius: "100px",
        padding: "5px 12px",
        width: "fit-content",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "#C84B31",
          flexShrink: 0,
          animation: "pulse-dot 1.5s ease-in-out infinite",
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "11px",
          fontWeight: 500,
          color: "#C84B31",
        }}
      >
        Recording
      </span>
    </div>
  );
}

function MiniCommitmentRow() {
  return (
    <div style={{ transform: "scale(0.88)", transformOrigin: "top left" }}>
      <CommitmentRow
        status="PENDING"
        ownerText="Ali Raza — Login feature"
        sourceText="Thu, May 15 · from standup"
      />
    </div>
  );
}

function SlackBubble() {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #E4E3DF",
        borderRadius: "8px",
        padding: "10px 14px",
        maxWidth: "280px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "11px",
          fontWeight: 700,
          color: "#1A6B3C",
          marginBottom: "4px",
        }}
      >
        Vocaply
      </p>
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "13px",
          color: "#0A0A0A",
          lineHeight: 1.5,
          marginBottom: "6px",
        }}
      >
        Your login feature is due tomorrow. Any update?
      </p>
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "11px",
          color: "#9B9A96",
        }}
      >
        9:00 AM · Slack
      </p>
    </div>
  );
}

function MissedBadge() {
  return (
    <div>
      <StatusBadge variant="MISSED" />
    </div>
  );
}

function SummarySnippet() {
  return (
    <div
      style={{
        background: "#F2F1EE",
        borderRadius: "6px",
        padding: "10px 12px",
        maxWidth: "320px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "13px",
          color: "#6B6A67",
          lineHeight: 1.5,
        }}
      >
        ⚠ 2 open from last week: Ali → Login feature (3 days overdue)
      </p>
    </div>
  );
}

function getCallout(type: string) {
  switch (type) {
    case "recording-pill":   return <RecordingPill />;
    case "commitment-row":   return <MiniCommitmentRow />;
    case "slack-bubble":     return <SlackBubble />;
    case "missed-badge":     return <MissedBadge />;
    case "summary-snippet":  return <SummarySnippet />;
    default:                 return null;
  }
}

// ── Section ───────────────────────────────────────────────────────────────────

export function WorkflowTimeline() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isVisible = useInView(sectionRef, { once: true, amount: 0.12 });

  // Node animation variants — odd nodes come from left, even from right
  const nodeVariant = (isEven: boolean) => ({
    hidden: { opacity: 0, x: isEven ? 30 : -30 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.55, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
    },
  });

  const containerVariant = {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.2 },
    },
  };

  return (
    <section
      aria-label="Workflow timeline"
      style={{
        background: "white",
        padding: "clamp(60px, 8vw, 100px) var(--pad, clamp(20px, 5vw, 80px))",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <SectionLabel>See it in action</SectionLabel>
          <div style={{ marginBottom: "56px", maxWidth: "640px" }}>
            <SectionHeading>
              {"From standup to accountability — |in under 5 minutes.|"}
            </SectionHeading>
          </div>
        </motion.div>

        {/* Timeline container */}
        <div
          ref={sectionRef}
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            position: "relative",
          }}
        >
          {/* ── Vertical line (desktop only) ── */}
          <div
            aria-hidden="true"
            className="timeline-line-desktop"
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              width: "2px",
              top: "24px",
              bottom: "24px",
              background: "#E4E3DF",
              transformOrigin: "top",
            }}
          >
            {/* Animated green fill line */}
            <motion.div
              initial={{ scaleY: 0 }}
              animate={isVisible ? { scaleY: 1 } : { scaleY: 0 }}
              transition={{ duration: 1.2, ease: "linear", delay: 0.2 }}
              style={{
                position: "absolute",
                inset: 0,
                background: "#1A6B3C",
                transformOrigin: "top",
              }}
            />
          </div>

          {/* ── Vertical line (mobile only) — left side ── */}
          <div
            aria-hidden="true"
            className="timeline-line-mobile"
            style={{
              display: "none",        // shown at <768px via CSS
              position: "absolute",
              left: "7px",
              width: "2px",
              top: "8px",
              bottom: "8px",
              background: "#E4E3DF",
            }}
          />

          {/* ── Nodes ── */}
          <motion.div
            variants={containerVariant}
            initial="hidden"
            animate={isVisible ? "visible" : "hidden"}
          >
            {workflowSteps.map((step, index) => {
              const isEven = index % 2 !== 0; // 0-based: indices 1, 3 are "even" in visual sense
              return (
                <motion.div
                  key={step.id}
                  variants={nodeVariant(isEven)}
                >
                  <TimelineNode
                    timestamp={step.timestamp}
                    title={step.title}
                    description={step.description}
                    isEven={isEven}
                    callout={getCallout(step.calloutType)}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </div>

      {/* ── Responsive CSS ── */}
      <style>{`
        @media (max-width: 767px) {
          .timeline-node-desktop { display: none !important; }
          .timeline-node-mobile  { display: flex !important; }
          .timeline-line-desktop { display: none !important; }
          .timeline-line-mobile  { display: block !important; }
        }
      `}</style>
    </section>
  );
}
