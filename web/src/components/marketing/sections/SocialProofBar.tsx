/**
 * SocialProofBar.tsx
 * Full-width integration logos strip below the Hero section.
 * Uses real SVG icons from /public/icons/ via IntegrationPill.
 */

import { IntegrationPill } from "@/components/marketing/ui/IntegrationPill";
import { integrations, socialProofLabel } from "@/lib/marketing/content/social-proof.content";

export function SocialProofBar() {
  return (
    <section
      id="integrations"
      aria-label="Trusted integrations"
      style={{
        width: "100%",
        background: "#F2F1EE",
        borderTop: "1px solid #E4E3DF",
        borderBottom: "1px solid #E4E3DF",
      }}
    >
      {/* Scrollable inner — centers on large screens, scrolls on mobile */}
      <div
        className="social-proof-inner"
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
          padding: "0 var(--pad)",
          height: "64px",
          display: "flex",
          alignItems: "center",
          gap: "32px",
          overflowX: "auto",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        } as React.CSSProperties}
      >
        {/* Label */}
        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "11px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#9B9A96",
            whiteSpace: "nowrap",
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          {socialProofLabel}
        </p>

        {/* Thin separator */}
        <div
          aria-hidden="true"
          style={{
            width: "1px",
            height: "20px",
            background: "#D4D3CF",
            flexShrink: 0,
          }}
        />

        {/* Integration pills */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "28px",
            flexShrink: 0,
          }}
        >
          {integrations.map((integration) => (
            <IntegrationPill
              key={integration.name}
              name={integration.name}
              iconPath={integration.iconPath}
              iconAlt={integration.iconAlt}
            />
          ))}
        </div>
      </div>

      <style>{`
        .social-proof-inner::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  );
}
