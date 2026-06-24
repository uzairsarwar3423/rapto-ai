/**
 * StatusBadge.tsx
 * Pill-shaped status badge used in MockCommitmentsView.
 * Six variants: MISSED, FULFILLED, PENDING, DEFERRED, DUE_TODAY, RECORDING
 */

export type BadgeVariant =
  | "MISSED"
  | "FULFILLED"
  | "PENDING"
  | "DEFERRED"
  | "DUE_TODAY"
  | "RECORDING";

interface StatusBadgeProps {
  variant: BadgeVariant;
}

const BADGE_CONFIG: Record<
  BadgeVariant,
  { bg: string; color: string; label: string; pulse?: boolean }
> = {
  MISSED: {
    bg: "#FDECEA",
    color: "#C84B31",
    label: "Missed",
  },
  FULFILLED: {
    bg: "#E8F5EE",
    color: "#1A6B3C",
    label: "Fulfilled",
  },
  PENDING: {
    bg: "#F2F1EE",
    color: "#6B6A67",
    label: "Pending",
  },
  DEFERRED: {
    bg: "#EEF2FF",
    color: "#4F46E5",
    label: "Deferred",
  },
  DUE_TODAY: {
    bg: "#FFFBF0",
    color: "#7A5C00",
    label: "Due today",
  },
  RECORDING: {
    bg: "#FDECEA",
    color: "#C84B31",
    label: "Recording",
    pulse: true,
  },
};

export function StatusBadge({ variant }: StatusBadgeProps) {
  const config = BADGE_CONFIG[variant];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        background: config.bg,
        color: config.color,
        fontFamily: "var(--font-sans, system-ui)",
        fontSize: "11px",
        fontWeight: 500,
        padding: "3px 8px",
        borderRadius: "100px",
        whiteSpace: "nowrap",
        lineHeight: 1.4,
        flexShrink: 0,
      }}
    >
      {config.pulse && (
        <span
          aria-hidden="true"
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: config.color,
            animation: "pulse-dot 1.5s ease-in-out infinite",
            flexShrink: 0,
          }}
        />
      )}
      {config.label}
    </span>
  );
}
