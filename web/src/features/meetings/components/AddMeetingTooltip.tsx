"use client";

import React, { useState, useRef, useEffect } from "react";

interface AddMeetingTooltipProps {
  children: React.ReactNode;
}

export function AddMeetingTooltip({ children }: AddMeetingTooltipProps) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<"in" | "out" | "idle">("idle");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (dismissed) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    setOpen(true);
    // Small tick to allow mount then trigger in-animation
    requestAnimationFrame(() => setPhase("in"));
  };

  const hide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setPhase("out");
      phaseTimer.current = setTimeout(() => {
        setOpen(false);
        setPhase("idle");
      }, 200);
    }, 120);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPhase("out");
    phaseTimer.current = setTimeout(() => {
      setOpen(false);
      setDismissed(true);
      setPhase("idle");
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (phaseTimer.current) clearTimeout(phaseTimer.current);
    };
  }, []);

  if (dismissed) return <>{children}</>;

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}

      {open && (
        <div
          className="absolute z-[9999]"
          style={{
            top: "calc(100% + 10px)",
            right: 0,
          }}
        >
          {/* ── Upward arrow — aligned to button right side ── */}
          <div
            style={{
              position: "absolute",
              top: -8,
              right: 28,
              width: 0,
              height: 0,
              borderLeft: "9px solid transparent",
              borderRight: "9px solid transparent",
              borderBottom: "9px solid #ffffff",
              filter: "drop-shadow(0 -2px 3px rgba(0,0,0,0.08))",
              zIndex: 1,
            }}
          />

          {/* ── Tooltip Card ── */}
          <div
            style={{
              width: 308,
              borderRadius: 20,
              overflow: "hidden",
              boxShadow:
                "0 0 0 1px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.12), 0 24px 56px rgba(0,0,0,0.20)",
              animation:
                phase === "out"
                  ? "amt_out 200ms cubic-bezier(0.4, 0, 1, 1) forwards"
                  : "amt_in 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          >
            {/* ────────────────────────────────────────
                TOP — White mini-table preview
            ──────────────────────────────────────── */}
            <div
              style={{
                backgroundColor: "#f5f5f7",
                padding: "14px 14px 12px",
              }}
            >
              {/* Inner table card */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {/* Row 1 — normal */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  <div
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: 4,
                      border: "1.5px solid #d1d5db",
                      flexShrink: 0,
                      backgroundColor: "#fff",
                    }}
                  />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                    <div
                      style={{
                        height: 8,
                        width: 88,
                        backgroundColor: "#e5e7eb",
                        borderRadius: 99,
                      }}
                    />
                  </div>
                </div>

                {/* Row 2 — active / editing */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 12px",
                    borderBottom: "1px solid #f0f0f0",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: 4,
                      border: "1.5px solid #d1d5db",
                      flexShrink: 0,
                      backgroundColor: "#fff",
                    }}
                  />
                  {/* Active input with blue border */}
                  <div style={{ flex: 1, position: "relative" }}>
                    <div
                      style={{
                        height: 30,
                        borderRadius: 6,
                        border: "2px solid #2563eb",
                        backgroundColor: "#fff",
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: 8,
                      }}
                    >
                      {/* Blinking cursor */}
                      <span
                        style={{
                          display: "inline-block",
                          width: 1.5,
                          height: 16,
                          backgroundColor: "#1a1a1a",
                          animation: "amt_blink 1s step-end infinite",
                          borderRadius: 1,
                        }}
                      />
                    </div>
                    {/* Red required-field indicator dot */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: -2,
                        right: -2,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: "#ef4444",
                        border: "1.5px solid #fff",
                      }}
                    />
                  </div>
                </div>

                {/* Row 3 — normal */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                  }}
                >
                  <div
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: 4,
                      border: "1.5px solid #d1d5db",
                      flexShrink: 0,
                      backgroundColor: "#fff",
                    }}
                  />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                    <div
                      style={{
                        height: 8,
                        width: 72,
                        backgroundColor: "#e5e7eb",
                        borderRadius: 99,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ────────────────────────────────────────
                BOTTOM — Dark content area
            ──────────────────────────────────────── */}
            <div
              style={{
                backgroundColor: "#1c1c1e",
                padding: "16px 18px 14px",
              }}
            >
              {/* Heading */}
              <h3
                style={{
                  margin: 0,
                  marginBottom: 6,
                  fontSize: 17,
                  fontWeight: 700,
                  color: "#ffffff",
                  letterSpacing: "-0.3px",
                  lineHeight: 1.3,
                  fontFamily: "inherit",
                }}
              >
                Add a meeting
              </h3>

              {/* Description */}
              <p
                style={{
                  margin: 0,
                  marginBottom: 14,
                  fontSize: 13.5,
                  color: "#9ca3af",
                  lineHeight: 1.55,
                  fontFamily: "inherit",
                }}
              >
                Easily add or insert new rows into your meeting table
              </p>

              {/* Got it button */}
              <button
                onClick={handleDismiss}
                style={{
                  width: "100%",
                  backgroundColor: "#2c2c2e",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 12,
                  fontSize: 14.5,
                  fontWeight: 500,
                  padding: "11px 0",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background-color 150ms ease",
                  outline: "none",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#3a3a3c";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2c2c2e";
                }}
                onMouseDown={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#48484a";
                }}
                onMouseUp={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#3a3a3c";
                }}
              >
                Got it
              </button>
            </div>
          </div>

          {/* Keyframe animations */}
          <style>{`
            @keyframes amt_in {
              from {
                opacity: 0;
                transform: translateY(-8px) scale(0.96);
              }
              to {
                opacity: 1;
                transform: translateY(0px) scale(1);
              }
            }
            @keyframes amt_out {
              from {
                opacity: 1;
                transform: translateY(0px) scale(1);
              }
              to {
                opacity: 0;
                transform: translateY(-5px) scale(0.97);
              }
            }
            @keyframes amt_blink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
