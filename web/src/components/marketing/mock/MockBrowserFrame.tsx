/**
 * MockBrowserFrame.tsx
 * Browser chrome wrapper — reusable component.
 * Renders traffic light dots + URL bar on top, children below.
 * Fully responsive — height adapts to viewport.
 */

import type { ReactNode } from "react";

interface MockBrowserFrameProps {
  children: ReactNode;
  urlText?: string;
}

export function MockBrowserFrame({
  children,
  urlText = "app.rapto.ai/commitments",
}: MockBrowserFrameProps) {
  return (
    <div
      className="mock-frame"
      style={{
        background: "#FFFFFF",
        border: "1px solid #E4E3DF",
        borderRadius: "12px",
        boxShadow:
          "0 4px 40px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)",
        overflow: "hidden",
        width: "100%",
      }}
    >
      {/* ── Browser chrome bar ─────────────────────────────── */}
      <div
        style={{
          height: "38px",
          background: "#F2F1EE",
          borderBottom: "1px solid #E4E3DF",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: "10px",
          flexShrink: 0,
        }}
      >
        {/* Traffic light dots */}
        <div
          aria-hidden="true"
          style={{ display: "flex", gap: "5px", flexShrink: 0 }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#FF5F56",
              display: "block",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#FFBD2E",
              display: "block",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#27C93F",
              display: "block",
              flexShrink: 0,
            }}
          />
        </div>

        {/* URL bar */}
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            minWidth: 0,
          }}
        >
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E4E3DF",
              borderRadius: "4px",
              padding: "3px 8px",
              maxWidth: "260px",
              width: "100%",
            }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "11px",
                color: "#9B9A96",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
                textAlign: "center",
              }}
            >
              {urlText}
            </span>
          </div>
        </div>

        {/* Spacer to balance left dots */}
        <div style={{ width: "40px", flexShrink: 0 }} aria-hidden="true" />
      </div>

      {/* ── Content area ──────────────────────────────────── */}
      <div
        className="mock-frame-content"
        style={{
          display: "flex",
          background: "#FAFAF8",
          overflow: "hidden",
        }}
      >
        {children}
      </div>

      <style>{`
        /* Desktop: full-size mock */
        .mock-frame-content {
          min-height: 360px;
          max-height: 440px;
        }

        /* Tablet: slightly shorter */
        @media (max-width: 1024px) {
          .mock-frame-content {
            min-height: 320px;
            max-height: 380px;
          }
        }

        /* Mobile: compact height so it fits on screen */
        @media (max-width: 768px) {
          .mock-frame-content {
            min-height: 280px;
            max-height: 340px;
          }
        }

        /* Small mobile */
        @media (max-width: 480px) {
          .mock-frame-content {
            min-height: 260px;
            max-height: 300px;
          }

          .mock-frame {
            border-radius: 8px;
          }
        }
      `}</style>
    </div>
  );
}
