/**
 * MockCommitmentsView.tsx
 * Main content view — commitment tracker UI mock.
 * Fully responsive: tighter padding on mobile, scrollable inside fixed frame.
 */

import { CommitmentRow } from "@/components/marketing/ui/CommitmentRow";

export function MockCommitmentsView() {
  return (
    <div
      className="commitments-view"
      style={{
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
        background: "#FAFAF8",
        minWidth: 0,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
          flexWrap: "wrap",
          gap: "6px",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "#9B9A96",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          Team Commitments · This Week
        </p>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
          {["All", "Missed", "Due"].map((f, i) => (
            <span
              key={f}
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "10px",
                fontWeight: 500,
                padding: "2px 6px",
                borderRadius: "100px",
                background: i === 0 ? "#0A0A0A" : "#F2F1EE",
                color: i === 0 ? "#FAFAF8" : "#6B6A67",
                cursor: "default",
                lineHeight: 1.4,
                whiteSpace: "nowrap",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Commitment rows */}
      <CommitmentRow
        status="MISSED"
        ownerText="Ahmed Hassan — 'Finish login by Thursday'"
        sourceText="Monday Standup · 2 days overdue"
        animationDelay="0ms"
      />
      <CommitmentRow
        status="FULFILLED"
        ownerText="Sara Khan — 'Send design file to client'"
        sourceText="Sprint Review · Completed on time"
        animationDelay="80ms"
      />
      <CommitmentRow
        status="DUE_TODAY"
        ownerText="Ali Raza — 'Review PRs before EOD'"
        sourceText="Monday Standup · Due in 6 hours"
        animationDelay="160ms"
      />
      <CommitmentRow
        status="PENDING"
        ownerText="Zara Sheikh — 'Complete landing page'"
        sourceText="1:1 with Manager · Due in 3 days"
        animationDelay="240ms"
      />

      {/* Bottom summary strip */}
      <div
        style={{
          marginTop: "10px",
          padding: "8px 10px",
          background: "#F2F1EE",
          borderRadius: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "4px",
        }}
      >
        <div style={{ display: "flex", gap: "12px" }}>
          {[
            { label: "Total", value: "12", color: "#6B6A67" },
            { label: "Fulfilled", value: "7", color: "#1A6B3C" },
            { label: "Missed", value: "2", color: "#C84B31" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "9px",
                  color: "#9B9A96",
                  lineHeight: 1,
                  marginBottom: "2px",
                }}
              >
                {label}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "13px",
                  fontWeight: 600,
                  color,
                  lineHeight: 1,
                }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
        <span
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "9px",
            color: "#9B9A96",
            whiteSpace: "nowrap",
          }}
        >
          Updated just now
        </span>
      </div>

      <style>{`
        /* Desktop: normal padding */
        .commitments-view {
          padding: 16px 18px;
        }

        /* Tablet */
        @media (max-width: 1024px) {
          .commitments-view {
            padding: 14px 14px;
          }
        }

        /* Mobile: compact padding */
        @media (max-width: 768px) {
          .commitments-view {
            padding: 12px 12px;
          }
        }
      `}</style>
    </div>
  );
}
