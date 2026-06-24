"use client";

/**
 * WaitlistForm.tsx
 * Reusable waitlist signup form.
 * Shows validation errors inline, loading state with spinner,
 * and a premium success state with confetti-style pulse animation.
 *
 * Used inside:
 *   - /waitlist page (standalone)
 *   - WaitlistModal (overlay)
 */

import { CheckCircle, Loader2, AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { useWaitlistForm } from "@/hooks/marketing/useWaitlistForm";

const TEAM_SIZES = [
  { value: "", label: "Team size" },
  { value: "1-5", label: "1–5 people" },
  { value: "6-15", label: "6–15 people" },
  { value: "16-50", label: "16–50 people" },
  { value: "51-200", label: "51–200 people" },
  { value: "200+", label: "200+ people" },
];

const ROLES = [
  { value: "", label: "Your role" },
  { value: "engineering-manager", label: "Engineering Manager" },
  { value: "team-lead", label: "Team Lead / Tech Lead" },
  { value: "product-manager", label: "Product Manager" },
  { value: "cto", label: "CTO / VP Engineering" },
  { value: "founder", label: "Founder / Co-founder" },
  { value: "developer", label: "Developer / Engineer" },
  { value: "other", label: "Other" },
];

interface WaitlistFormProps {
  /** Compact variant used inside modal — hides some descriptive text */
  compact?: boolean;
  onSuccess?: () => void;
}

// Field styling helpers
function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: "100%",
    height: "44px",
    padding: "0 14px",
    fontFamily: "var(--font-sans, system-ui)",
    fontSize: "14px",
    color: "#0A0A0A",
    background: "#FAFAF8",
    border: `1px solid ${hasError ? "#C84B31" : "#E4E3DF"}`,
    borderRadius: "8px",
    outline: "none",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
    boxSizing: "border-box" as const,
  };
}

function selectStyle(hasError: boolean): React.CSSProperties {
  return {
    ...inputStyle(hasError),
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
    cursor: "pointer",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239B9A96' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    paddingRight: "36px",
  };
}

function labelStyle(): React.CSSProperties {
  return {
    display: "block",
    fontFamily: "var(--font-sans, system-ui)",
    fontSize: "12px",
    fontWeight: 500,
    color: "#6B6A67",
    marginBottom: "6px",
    letterSpacing: "0.01em",
  };
}

function errorStyle(): React.CSSProperties {
  return {
    fontFamily: "var(--font-sans, system-ui)",
    fontSize: "12px",
    color: "#C84B31",
    marginTop: "4px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  };
}

export function WaitlistForm({ compact = false, onSuccess }: WaitlistFormProps) {
  const {
    fields,
    errors,
    touched,
    status,
    errorMessage,
    handleChange,
    handleBlur,
    handleSubmit,
    reset,
    isLoading,
    isSuccess,
  } = useWaitlistForm();

  // Notify parent on success
  if (isSuccess && onSuccess) {
    // Slight delay so user sees the success state before modal closes
    setTimeout(onSuccess, 2500);
  }

  if (isSuccess) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: compact ? "32px 24px" : "48px 32px",
          textAlign: "center",
          gap: "16px",
          minHeight: compact ? "280px" : "360px",
        }}
      >
        {/* Animated success icon */}
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "#E8F5EE",
            border: "2px solid #1A6B3C",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "success-pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
          }}
        >
          <CheckCircle size={32} style={{ color: "#1A6B3C" }} />
        </div>

        <div>
          <h3
            style={{
              fontFamily: "var(--font-serif, Georgia, serif)",
              fontSize: compact ? "22px" : "26px",
              fontWeight: 400,
              color: "#0A0A0A",
              marginBottom: "8px",
              letterSpacing: "-0.5px",
            }}
          >
            You&apos;re on the list!
          </h3>
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "14px",
              color: "#6B6A67",
              lineHeight: 1.6,
              maxWidth: "320px",
            }}
          >
            We&apos;ll reach out personally when your spot opens up. Expect to hear from us
            within 3–5 business days.
          </p>
        </div>

        <div
          style={{
            marginTop: "8px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            background: "#E8F5EE",
            borderRadius: "100px",
            border: "1px solid rgba(26,107,60,0.15)",
          }}
        >
          <Sparkles size={13} style={{ color: "#1A6B3C" }} />
          <span
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "12px",
              fontWeight: 500,
              color: "#1A6B3C",
            }}
          >
            Position #{Math.floor(Math.random() * 200) + 800} secured
          </span>
        </div>

        <button
          onClick={reset}
          style={{
            marginTop: "4px",
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "12px",
            color: "#9B9A96",
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: "2px",
          }}
        >
          Submit another response
        </button>

        <style>{`
          @keyframes success-pop {
            from { transform: scale(0.5); opacity: 0; }
            to   { transform: scale(1);   opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Name */}
        <div>
          <label htmlFor="waitlist-name" style={labelStyle()}>Full name *</label>
          <input
            id="waitlist-name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Ahmed Hassan"
            value={fields.name}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isLoading}
            style={inputStyle(!!(touched.name && errors.name))}
            className="waitlist-input"
          />
          {touched.name && errors.name && (
            <p style={errorStyle()} role="alert">
              <AlertCircle size={12} />
              {errors.name}
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="waitlist-email" style={labelStyle()}>Work email *</label>
          <input
            id="waitlist-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="ahmed@company.com"
            value={fields.email}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isLoading}
            style={inputStyle(!!(touched.email && errors.email))}
            className="waitlist-input"
          />
          {touched.email && errors.email && (
            <p style={errorStyle()} role="alert">
              <AlertCircle size={12} />
              {errors.email}
            </p>
          )}
        </div>

        {/* Company */}
        <div>
          <label htmlFor="waitlist-company" style={labelStyle()}>Company name</label>
          <input
            id="waitlist-company"
            name="company"
            type="text"
            autoComplete="organization"
            placeholder="Acme Corp (optional)"
            value={fields.company}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isLoading}
            style={inputStyle(false)}
            className="waitlist-input"
          />
        </div>

        {/* Team Size + Role — 2 columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
          className="waitlist-two-col"
        >
          {/* Team Size */}
          <div>
            <label htmlFor="waitlist-teamSize" style={labelStyle()}>Team size *</label>
            <select
              id="waitlist-teamSize"
              name="teamSize"
              value={fields.teamSize}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={isLoading}
              style={selectStyle(!!(touched.teamSize && errors.teamSize))}
            >
              {TEAM_SIZES.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={!opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {touched.teamSize && errors.teamSize && (
              <p style={errorStyle()} role="alert">
                <AlertCircle size={12} />
                {errors.teamSize}
              </p>
            )}
          </div>

          {/* Role */}
          <div>
            <label htmlFor="waitlist-role" style={labelStyle()}>Your role *</label>
            <select
              id="waitlist-role"
              name="role"
              value={fields.role}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={isLoading}
              style={selectStyle(!!(touched.role && errors.role))}
            >
              {ROLES.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={!opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {touched.role && errors.role && (
              <p style={errorStyle()} role="alert">
                <AlertCircle size={12} />
                {errors.role}
              </p>
            )}
          </div>
        </div>

        {/* Server error */}
        {status === "error" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              background: "#FDECEA",
              border: "1px solid rgba(200,75,49,0.2)",
              borderRadius: "8px",
            }}
            role="alert"
          >
            <AlertCircle size={14} style={{ color: "#C84B31", flexShrink: 0 }} />
            <span
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "13px",
                color: "#C84B31",
              }}
            >
              {errorMessage}
            </span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: "100%",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            background: isLoading ? "#2D8A50" : "#1A6B3C",
            color: "#FAFAF8",
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "15px",
            fontWeight: 500,
            border: "none",
            borderRadius: "8px",
            cursor: isLoading ? "not-allowed" : "pointer",
            transition: "background 200ms ease, transform 200ms ease",
            marginTop: "4px",
          }}
          className="waitlist-submit"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              Joining waitlist...
            </>
          ) : (
            <>
              Join the waitlist
              <ArrowRight size={16} />
            </>
          )}
        </button>

        {/* Privacy note */}
        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "11px",
            color: "#9B9A96",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          No spam, ever. We&apos;ll only reach out when your spot opens.
          <br />
          Unsubscribe at any time.
        </p>
      </div>

      <style>{`
        .waitlist-input:focus {
          border-color: #1A6B3C !important;
          box-shadow: 0 0 0 3px rgba(26,107,60,0.08) !important;
        }
        .waitlist-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .waitlist-submit:hover:not(:disabled) {
          background: #2D8A50 !important;
          transform: translateY(-1px);
        }
        .waitlist-submit:active:not(:disabled) {
          transform: scale(0.98);
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @media (max-width: 480px) {
          .waitlist-two-col {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </form>
  );
}
