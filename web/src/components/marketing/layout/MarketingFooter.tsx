"use client";

/**
 * MarketingFooter.tsx — Day 9 (Responsive Rewrite)
 *
 * Premium 3-zone footer:
 *   ZONE 1 — Brand column (logo, tagline, social icons, newsletter mini-form)
 *   ZONE 2 — 4 nav columns (Product, Resources, Company, Compare)
 *   ZONE 3 — Bottom bar (copyright · legal links · status badge)
 *
 * Breakpoints:
 *   ≥ 1024px  → 5-column grid (brand + 4 nav cols)
 *   768–1023px → 2 rows: brand row + 2×2 nav grid
 *   < 768px   → Single column, brand centered, nav 2×2, bottom stacked
 */

import { useState } from "react";

// ─── Social Icon SVGs ────────────────────────────────────────────────────────

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.736l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

const navColumns = [
  {
    header: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Integrations", href: "#integrations" },
      { label: "Pricing", href: "#pricing" },
      { label: "Changelog", href: "/changelog" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
  {
    header: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Documentation", href: "/docs" },
      { label: "API Reference", href: "/api" },
      { label: "Case Studies", href: "/case-studies" },
      { label: "Status", href: "/status" },
    ],
  },
  {
    header: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Press", href: "/press" },
      { label: "Legal", href: "/legal" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    header: "Compare",
    links: [
      { label: "vs Otter.ai", href: "/compare/otter-ai" },
      { label: "vs Fireflies", href: "/compare/fireflies" },
      { label: "vs Fathom", href: "/compare/fathom" },
      { label: "vs Gong", href: "/compare/gong" },
    ],
  },
];

const socialLinks = [
  { label: "Follow on X / Twitter", href: "https://twitter.com/rapto", Icon: XIcon },
  { label: "Connect on LinkedIn", href: "https://linkedin.com/company/rapto", Icon: LinkedInIcon },
  { label: "View on GitHub", href: "https://github.com/rapto", Icon: GitHubIcon },
];

const legalLinks = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Cookie Settings", href: "/cookies" },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function FooterLink({ label, href }: { label: string; href: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block",
        fontFamily: "var(--font-sans, system-ui)",
        fontSize: "13.5px",
        color: hovered ? "#0A0A0A" : "#7A7976",
        lineHeight: "2.0",
        textDecoration: "none",
        transition: "color 150ms ease",
        letterSpacing: "-0.1px",
      }}
    >
      {label}
    </a>
  );
}

function SocialBtn({
  label,
  href,
  Icon,
}: {
  label: string;
  href: string;
  Icon: React.ComponentType;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "34px",
        height: "34px",
        borderRadius: "8px",
        border: `1px solid ${hovered ? "#D0CFC9" : "#E4E3DF"}`,
        background: hovered ? "white" : "transparent",
        color: hovered ? "#0A0A0A" : "#9B9A96",
        transition: "all 180ms ease",
        flexShrink: 0,
      }}
    >
      <Icon />
    </a>
  );
}

// ─── Mini newsletter form ─────────────────────────────────────────────────────

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) setSubmitted(true);
  };

  if (submitted) {
    return (
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "12px",
          color: "#1A6B3C",
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span style={{ fontSize: "14px" }}>✓</span> You&apos;re on the list!
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: "6px", width: "100%" }}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        aria-label="Email for product updates"
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "13px",
          color: "#0A0A0A",
          background: "white",
          border: "1px solid #E4E3DF",
          borderRadius: "6px",
          padding: "8px 12px",
          outline: "none",
          transition: "border-color 150ms ease",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#1A6B3C")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#E4E3DF")}
      />
      <button
        type="submit"
        style={{
          flexShrink: 0,
          background: "#0A0A0A",
          color: "white",
          border: "none",
          borderRadius: "6px",
          padding: "8px 14px",
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "12px",
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 200ms ease",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background = "#1A6B3C")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background = "#0A0A0A")
        }
      >
        Subscribe
      </button>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MarketingFooter() {
  return (
    <footer
      aria-label="Site footer"
      style={{
        background: "#FAFAF8",
        borderTop: "1px solid #E4E3DF",
      }}
    >
      {/* ── Main grid area ── */}
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "clamp(40px, 6vw, 64px) var(--pad, clamp(20px, 5vw, 72px)) 0",
        }}
      >
        <div className="footer-main-grid">

          {/* ── BRAND COLUMN ── */}
          <div className="footer-brand-col">
            {/* Logo */}
            <a
              href="/"
              aria-label="Rapto home"
              style={{
                fontFamily: "var(--font-serif, Georgia, serif)",
                fontSize: "24px",
                fontWeight: 400,
                color: "#0A0A0A",
                textDecoration: "none",
                letterSpacing: "-0.5px",
                display: "inline-block",
                lineHeight: 1,
              }}
            >
              rapto
            </a>

            {/* Tagline */}
            <p
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "13px",
                fontStyle: "italic",
                color: "#9B9A96",
                marginTop: "10px",
                marginBottom: "0",
                lineHeight: 1.55,
                maxWidth: "200px",
              }}
            >
              Not just transcription.<br />Accountability.
            </p>

            {/* Divider */}
            <div
              style={{
                height: "1px",
                background: "#E4E3DF",
                margin: "20px 0",
                maxWidth: "200px",
              }}
            />

            {/* Newsletter CTA */}
            <p
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#0A0A0A",
                marginBottom: "10px",
                marginTop: 0,
              }}
            >
              Product updates
            </p>
            <div style={{ maxWidth: "220px" }}>
              <NewsletterForm />
            </div>

            {/* Social icons */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                marginTop: "20px",
              }}
            >
              {socialLinks.map(({ label, href, Icon }) => (
                <SocialBtn key={label} label={label} href={href} Icon={Icon} />
              ))}
            </div>
          </div>

          {/* ── NAV COLUMNS ── */}
          <div className="footer-nav-grid">
            {navColumns.map((col) => (
              <div key={col.header} className="footer-nav-col">
                <p
                  style={{
                    fontFamily: "var(--font-sans, system-ui)",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "#0A0A0A",
                    marginBottom: "8px",
                    marginTop: 0,
                  }}
                >
                  {col.header}
                </p>
                {col.links.map((link) => (
                  <FooterLink key={link.label} label={link.label} href={link.href} />
                ))}
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 var(--pad, clamp(20px, 5vw, 72px))",
        }}
      >
        <div className="footer-bottom-bar">

          {/* Copyright */}
          <p
            className="footer-copyright"
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "12px",
              color: "#9B9A96",
              margin: 0,
              whiteSpace: "nowrap",
            }}
          >
            © 2026 Rapto, Inc. All rights reserved.
          </p>

          {/* Legal links */}
          <div className="footer-legal-links">
            {legalLinks.map((link) => (
              <FooterLink key={link.label} label={link.label} href={link.href} />
            ))}
          </div>

          {/* Status badge */}
          <div className="footer-status">
            <a
              href="/status"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "11px",
                fontWeight: 500,
                color: "#9B9A96",
                textDecoration: "none",
                background: "#F2F1EE",
                border: "1px solid #E4E3DF",
                borderRadius: "100px",
                padding: "4px 10px 4px 8px",
                transition: "border-color 150ms ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.borderColor = "#1A6B3C")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.borderColor = "#E4E3DF")
              }
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#22c55e",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              All systems operational
            </a>
          </div>

        </div>
      </div>

      {/* ── Responsive CSS ── */}
      <style>{`

        /* ══ Main grid ══ */
        .footer-main-grid {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: clamp(32px, 5vw, 80px);
          align-items: start;
          margin-bottom: 40px;
        }

        /* ══ Nav 4-col grid ══ */
        .footer-nav-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }

        /* ══ Bottom bar ══ */
        .footer-bottom-bar {
          border-top: 1px solid #E4E3DF;
          padding: 18px 0 clamp(24px, 4vw, 36px);
          display: flex;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
        }

        /* Legal links in bottom bar */
        .footer-legal-links {
          display: flex;
          align-items: center;
          gap: 0;
          flex-wrap: wrap;
          flex: 1;
        }

        .footer-legal-links a {
          line-height: 1 !important;
          padding: 4px 12px;
          border-right: 1px solid #E4E3DF;
          font-size: 12px !important;
          white-space: nowrap;
        }

        .footer-legal-links a:first-child { padding-left: 0; }
        .footer-legal-links a:last-child  { border-right: none; }

        .footer-status {
          margin-left: auto;
        }

        /* ══ Tablet  768–1023px ══ */
        @media (max-width: 1023px) {
          .footer-main-grid {
            grid-template-columns: 1fr;
            gap: 32px;
          }

          .footer-brand-col {
            display: grid;
            grid-template-columns: auto 1fr;
            grid-template-rows: auto auto auto;
            column-gap: 32px;
            row-gap: 0;
            align-items: start;
          }

          /* Stagger brand content in 2-col mini-layout on tablet */
          .footer-brand-col > a          { grid-column: 1; grid-row: 1; }
          .footer-brand-col > p          { grid-column: 1; grid-row: 2; }
          .footer-brand-col > div:nth-child(3) { display: none; } /* hide divider */
          .footer-brand-col > p:nth-child(4)   { grid-column: 2; grid-row: 1; margin-top: 0; }
          .footer-brand-col > div:nth-child(5) { grid-column: 2; grid-row: 2; max-width: 100%; }
          .footer-brand-col > div:nth-child(6) { grid-column: 1; grid-row: 3; margin-top: 16px; }

          .footer-nav-grid {
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
          }
        }

        /* ══ Mobile  < 768px ══ */
        @media (max-width: 767px) {
          .footer-main-grid {
            grid-template-columns: 1fr;
            gap: 28px;
          }

          /* Reset brand to simple column */
          .footer-brand-col {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 0;
          }

          .footer-brand-col > a          { order: 1; }
          .footer-brand-col > p          { order: 2; max-width: 100% !important; }
          .footer-brand-col > div:nth-child(3) { display: block !important; order: 3; max-width: 100%; margin: 16px 0; }
          .footer-brand-col > p:nth-child(4)   { order: 4; margin-top: 0; }
          .footer-brand-col > div:nth-child(5) { order: 5; max-width: 100% !important; }
          .footer-brand-col > div:nth-child(6) { order: 6; margin-top: 16px; }

          /* Nav: 2×2 grid */
          .footer-nav-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 24px 20px;
          }

          /* Bottom bar: stack */
          .footer-bottom-bar {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            padding-bottom: clamp(80px, 15vw, 100px);  /* space for MobileCTABar */
          }

          .footer-status {
            margin-left: 0;
          }

          .footer-legal-links {
            flex-direction: row;
            flex-wrap: wrap;
          }

          .footer-legal-links a {
            border-right: none;
            padding: 2px 0;
            margin-right: 16px;
          }

          .footer-copyright {
            order: 3;
          }
        }

        /* ══ Small mobile  < 400px ══ */
        @media (max-width: 400px) {
          .footer-nav-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 20px 12px;
          }
        }
      `}</style>
    </footer>
  );
}
