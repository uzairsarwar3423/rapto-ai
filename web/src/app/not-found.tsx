import type { Metadata } from "next";
import { LogoIcon } from "@/components/ui/LogoIcon";

export const metadata: Metadata = {
  title: "Page Not Found",
  description: "The page you're looking for doesn't exist.",
};

/**
 * 404 Not Found page — Server Component (no event handlers)
 * Uses Rapto brand styling.
 */
export default function NotFound() {
  return (
    <>
      <style>{`
        .not-found-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #0A0A0A;
          color: #FAFAF8;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          transition: background 200ms ease;
        }
        .not-found-cta:hover {
          background: #1A6B3C;
        }
      `}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#FAFAF8",
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        {/* Big background number */}
        <p
          style={{
            fontFamily: "var(--font-serif), Georgia, serif",
            fontSize: "clamp(80px, 15vw, 160px)",
            fontStyle: "italic",
            color: "#E4E3DF",
            lineHeight: 1,
            marginBottom: "24px",
            userSelect: "none",
          }}
        >
          404
        </p>

        {/* Logo icon */}
        <div style={{ marginBottom: "32px" }}>
          <LogoIcon size={56} style={{ margin: "0 auto" }} />
        </div>

        <h1
          style={{
            fontFamily: "var(--font-serif), Georgia, serif",
            fontSize: "clamp(24px, 4vw, 36px)",
            color: "#0A0A0A",
            marginBottom: "12px",
            fontWeight: 400,
          }}
        >
          Page not found
        </h1>

        <p style={{ fontSize: "16px", color: "#6B6A67", marginBottom: "40px", maxWidth: "380px", lineHeight: 1.65 }}>
          This page doesn&apos;t exist or has been moved. Go back to the homepage.
        </p>

        <a href="/" className="not-found-cta">
          ← Back to homepage
        </a>
      </div>
    </>
  );
}
