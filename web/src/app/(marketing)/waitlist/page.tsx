"use client";

/**
 * WaitlistPage — /waitlist
 * Full dedicated page with social proof numbers, benefits list,
 * and the waitlist form embedded on the right column (desktop).
 * Single column on mobile.
 */

import Link from "next/link";
import { CheckCircle, Users, Clock, TrendingUp, ArrowLeft, Zap } from "lucide-react";
import { WaitlistForm } from "@/components/marketing/ui/WaitlistForm";

const STATS = [
  { value: "1,200+", label: "Teams on waitlist" },
  { value: "93%", label: "Extraction precision" },
  { value: "3 months", label: "Free for early access" },
];

const BENEFITS = [
  { icon: Zap, text: "3 months free when you join early access" },
  { icon: Users, text: "Dedicated onboarding session with our team" },
  { icon: TrendingUp, text: "Priority support + direct feature influence" },
  { icon: Clock, text: "Lock in the lowest price, forever" },
];

export default function WaitlistPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAFAF8",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Minimal header ─────────────────────────────────── */}
      <header
        style={{
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 var(--pad)",
          borderBottom: "1px solid #E4E3DF",
          background: "rgba(250,250,248,0.95)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <Link
          href="/"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "baseline" }}
          aria-label="Vocaply home"
        >
          <span
            style={{
              fontFamily: "var(--font-serif, Georgia, serif)",
              fontSize: "26px",
              fontWeight: 400,
              color: "#0A0A0A",
              letterSpacing: "-0.5px",
            }}
          >
            voca
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif, Georgia, serif)",
              fontSize: "26px",
              fontWeight: 400,
              color: "#1A6B3C",
              letterSpacing: "-0.5px",
            }}
          >
            ply
          </span>
        </Link>

        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "13px",
            color: "#6B6A67",
            textDecoration: "none",
            transition: "color 150ms ease",
          }}
          className="back-link"
        >
          <ArrowLeft size={14} />
          Back to homepage
        </Link>
      </header>

      {/* ── Main content ─────────────────────────────────────── */}
      <main
        id="main-content"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "clamp(40px, 6vw, 80px) var(--pad)",
          boxSizing: "border-box",
        }}
      >
        <div
          className="waitlist-page-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "clamp(40px, 6vw, 96px)",
            maxWidth: "1080px",
            width: "100%",
            alignItems: "start",
          }}
        >
          {/* ── LEFT: Social proof + benefits ─────────────────── */}
          <div>
            {/* Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 12px",
                background: "#E8F5EE",
                border: "1px solid rgba(26,107,60,0.15)",
                borderRadius: "100px",
                marginBottom: "24px",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#1A6B3C",
                  animation: "pulse-dot 2s ease-in-out infinite",
                  display: "block",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#1A6B3C",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Accepting early access
              </span>
            </div>

            {/* Headline */}
            <h1
              style={{
                fontFamily: "var(--font-serif, Georgia, serif)",
                fontSize: "clamp(32px, 4.5vw, 52px)",
                fontWeight: 400,
                color: "#0A0A0A",
                letterSpacing: "-1px",
                lineHeight: 1.1,
                marginBottom: "20px",
              }}
            >
              Your standups are full of promises.{" "}
              <em style={{ fontStyle: "italic", color: "#1A6B3C" }}>
                We make sure they&apos;re kept.
              </em>
            </h1>

            <p
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "clamp(15px, 1.8vw, 17px)",
                fontWeight: 300,
                color: "#6B6A67",
                lineHeight: 1.65,
                marginBottom: "40px",
                maxWidth: "440px",
              }}
            >
              Join{" "}
              <strong style={{ color: "#0A0A0A", fontWeight: 500 }}>1,200+ engineering managers</strong>{" "}
              waiting for AI that automatically extracts commitments, tracks ownership,
              and alerts your team before deadlines slip.
            </p>

            {/* Stats row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "20px",
                marginBottom: "40px",
                paddingBottom: "40px",
                borderBottom: "1px solid #E4E3DF",
              }}
            >
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <p
                    style={{
                      fontFamily: "var(--font-serif, Georgia, serif)",
                      fontSize: "clamp(22px, 2.5vw, 30px)",
                      fontWeight: 400,
                      color: "#1A6B3C",
                      letterSpacing: "-0.5px",
                      lineHeight: 1,
                      marginBottom: "4px",
                    }}
                  >
                    {stat.value}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "12px",
                      color: "#9B9A96",
                      lineHeight: 1.3,
                    }}
                  >
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Benefits list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {BENEFITS.map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      background: "#E8F5EE",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: "1px",
                    }}
                  >
                    <Icon size={14} style={{ color: "#1A6B3C" }} />
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "14px",
                      color: "#0A0A0A",
                      lineHeight: 1.5,
                      fontWeight: 400,
                    }}
                  >
                    {text}
                  </p>
                </div>
              ))}
            </div>

            {/* Social proof quote */}
            <div
              style={{
                marginTop: "40px",
                padding: "20px 24px",
                background: "#F2F1EE",
                borderRadius: "10px",
                borderLeft: "3px solid #1A6B3C",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "14px",
                  fontStyle: "italic",
                  color: "#0A0A0A",
                  lineHeight: 1.6,
                  marginBottom: "10px",
                }}
              >
                &ldquo;We used to spend 2 hours every week chasing updates. With Vocaply,
                accountability runs itself. Game changer for remote teams.&rdquo;
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "#E8F5EE",
                    border: "1px solid rgba(26,107,60,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-sans, system-ui)",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#1A6B3C",
                  }}
                >
                  SK
                </div>
                <div>
                  <p
                    style={{
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#0A0A0A",
                      lineHeight: 1.2,
                    }}
                  >
                    Sara Khan
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "11px",
                      color: "#9B9A96",
                      lineHeight: 1.2,
                    }}
                  >
                    Engineering Manager, TechFlow
                  </p>
                </div>
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <CheckCircle size={13} style={{ color: "#1A6B3C" }} />
                  <span
                    style={{
                      fontFamily: "var(--font-sans, system-ui)",
                      fontSize: "11px",
                      color: "#1A6B3C",
                      fontWeight: 500,
                    }}
                  >
                    Verified
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Form card ──────────────────────────────── */}
          <div>
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E4E3DF",
                borderRadius: "14px",
                padding: "32px",
                boxShadow: "0 4px 24px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.03)",
                position: "sticky",
                top: "80px",
              }}
            >
              {/* Card header */}
              <div style={{ marginBottom: "24px" }}>
                <h2
                  style={{
                    fontFamily: "var(--font-serif, Georgia, serif)",
                    fontSize: "24px",
                    fontWeight: 400,
                    color: "#0A0A0A",
                    letterSpacing: "-0.5px",
                    marginBottom: "6px",
                    lineHeight: 1.2,
                  }}
                >
                  Request early access
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-sans, system-ui)",
                    fontSize: "13.5px",
                    color: "#6B6A67",
                    lineHeight: 1.5,
                  }}
                >
                  We review each request and reach out personally. Takes less than a minute.
                </p>
              </div>

              <div
                style={{
                  height: "1px",
                  background: "#E4E3DF",
                  marginBottom: "24px",
                }}
              />

              <WaitlistForm />
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .back-link:hover { color: #0A0A0A !important; }

        @media (max-width: 768px) {
          .waitlist-page-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
        }
      `}</style>
    </div>
  );
}
