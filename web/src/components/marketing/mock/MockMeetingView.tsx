import * as Lucide from "lucide-react";

const EXTRACTED_ITEMS = [
  {
    type: "commitment" as const,
    iconName: "Pin",
    label: "Commitment",
    labelColor: "#1A6B3C",
    labelBg: "#E8F5EE",
    text: "Ahmed will finish the login feature by Thursday",
    meta: "Owner: Ahmed Hassan · Due: Thu, May 15",
  },
  {
    type: "action" as const,
    iconName: "Zap",
    label: "Action Item",
    labelColor: "#4F46E5",
    labelBg: "#EEF2FF",
    text: "Fix the payment gateway bug before next sprint",
    meta: "Owner: Sara Khan · Priority: High",
  },
  {
    type: "decision" as const,
    iconName: "CheckCircle",
    label: "Decision",
    labelColor: "#6B6A67",
    labelBg: "#F2F1EE",
    text: "Team decided to use PostgreSQL for the new service",
    meta: "Agreed by: All · Recorded by Vocaply AI",
  },
];

export function MockMeetingView() {
  return (
    <div
      className="meeting-view"
      style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        background: "#FAFAF8",
        minWidth: 0,
      }}
    >
      {/* Meeting header */}
      <div style={{ marginBottom: "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "6px",
          }}
        >
          <Lucide.Mic size={14} style={{ color: "#1A6B3C" }} />
          <h3
            style={{
              fontFamily: "var(--font-serif, Georgia, serif)",
              fontSize: "16px",
              fontWeight: 400,
              color: "#0A0A0A",
              lineHeight: 1.2,
            }}
          >
            Monday Standup
          </h3>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          {["May 13, 2026", "9:00 AM", "23 min", "4 attendees"].map(
            (item, i) => (
              <span
                key={i}
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "11px",
                  color: "#9B9A96",
                  lineHeight: 1,
                }}
              >
                {item}
              </span>
            )
          )}
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          height: "1px",
          background: "#E4E3DF",
          marginBottom: "16px",
        }}
      />

      {/* Section heading */}
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "#9B9A96",
          marginBottom: "12px",
          lineHeight: 1,
        }}
      >
        AI Extracted · 3 items
      </p>

      {/* Extracted items */}
      {EXTRACTED_ITEMS.map((item) => {
        const IconComponent = (Lucide as any)[item.iconName];
        return (
          <div
            key={item.type}
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-start",
              padding: "10px 12px",
              borderRadius: "6px",
              background: "#FFFFFF",
              border: "1px solid #E4E3DF",
              marginBottom: "8px",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: "3px",
              }}
            >
              {IconComponent && (
                <IconComponent size={14} style={{ color: item.labelColor }} />
              )}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-sans, system-ui)",
                    fontSize: "10px",
                    fontWeight: 600,
                    background: item.labelBg,
                    color: item.labelColor,
                    padding: "2px 6px",
                    borderRadius: "100px",
                    lineHeight: 1.4,
                  }}
                >
                  {item.label}
                </span>
              </div>
              <p
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#0A0A0A",
                  lineHeight: 1.4,
                  marginBottom: "3px",
                }}
              >
                {item.text}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "11px",
                  color: "#9B9A96",
                  lineHeight: 1.3,
                }}
              >
                {item.meta}
              </p>
            </div>
          </div>
        );
      })}

      {/* AI confidence note */}
      <div
        style={{
          marginTop: "8px",
          padding: "8px 12px",
          background: "#F2F1EE",
          borderRadius: "6px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <Lucide.Sparkles size={14} style={{ color: "#1A6B3C" }} />
        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "11px",
            color: "#6B6A67",
            lineHeight: 1.4,
          }}
        >
          Extracted by Vocaply AI · 94% confidence · Full transcript available
        </p>
      </div>
      <style>{`
        .meeting-view { padding: 16px 18px; }
        @media (max-width: 1024px) { .meeting-view { padding: 14px 14px; } }
        @media (max-width: 768px)  { .meeting-view { padding: 12px 12px; } }
      `}</style>
    </div>
  );
}
