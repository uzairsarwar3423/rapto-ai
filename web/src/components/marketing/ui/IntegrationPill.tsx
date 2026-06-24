/**
 * IntegrationPill.tsx
 * Logo + name pill for the SocialProofBar.
 * Uses real SVG icons from /public/icons/.
 */

import Image from "next/image";

interface IntegrationPillProps {
  name: string;
  iconPath: string;
  iconAlt: string;
}

export function IntegrationPill({ name, iconPath, iconAlt }: IntegrationPillProps) {
  return (
    <div
      className="integration-pill"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "7px",
        flexShrink: 0,
        cursor: "default",
        transition: "opacity 200ms ease, filter 200ms ease",
      }}
    >
      <div
        style={{
          width: "20px",
          height: "20px",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <Image
          src={iconPath}
          alt={iconAlt}
          width={20}
          height={20}
          style={{
            width: "20px",
            height: "20px",
            objectFit: "contain",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "13px",
          fontWeight: 600,
          color: "#9B9A96",
          whiteSpace: "nowrap",
          lineHeight: 1,
          transition: "color 200ms ease",
        }}
      >
        {name}
      </span>

      <style>{`
        .integration-pill {
          filter: grayscale(1) opacity(0.55);
        }
        .integration-pill:hover {
          filter: grayscale(0) opacity(1);
        }
        .integration-pill:hover span {
          color: #6B6A67;
        }
      `}</style>
    </div>
  );
}
