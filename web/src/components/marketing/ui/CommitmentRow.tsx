import * as Lucide from "lucide-react";
import { StatusBadge, type BadgeVariant } from "./StatusBadge";

interface CommitmentRowProps {
  status: BadgeVariant;
  ownerText: string;
  sourceText: string;
  animationDelay?: string;
  /** Custom badge text overrides (e.g. Due today is rendered as DUE_TODAY variant) */
  badgeOverride?: BadgeVariant;
}

const ROW_BG: Record<BadgeVariant, string> = {
  MISSED: "#FDECEA",
  FULFILLED: "#E8F5EE",
  PENDING: "#FFFFFF",
  DEFERRED: "#EEF2FF",
  DUE_TODAY: "#FFFBF0",
  RECORDING: "#FDECEA",
};

const ROW_OPACITY: Record<BadgeVariant, number> = {
  MISSED: 1,
  FULFILLED: 1,
  PENDING: 0.65,
  DEFERRED: 1,
  DUE_TODAY: 1,
  RECORDING: 1,
};

export function CommitmentRow({
  status,
  ownerText,
  sourceText,
  animationDelay = "0ms",
}: CommitmentRowProps) {
  const iconMap: Record<BadgeVariant, React.ComponentType<{ size: number; style?: React.CSSProperties }>> = {
    MISSED: Lucide.AlertTriangle,
    FULFILLED: Lucide.Check,
    DUE_TODAY: Lucide.Clock,
    PENDING: Lucide.Circle,
    DEFERRED: Lucide.ArrowRight,
    RECORDING: Lucide.Radio,
  };

  const IconComponent = iconMap[status] || Lucide.Circle;

  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
        background: ROW_BG[status],
        borderRadius: "6px",
        padding: "10px 12px",
        marginBottom: "6px",
        opacity: ROW_OPACITY[status],
        animation: `fade-up 0.4s ease both`,
        animationDelay,
      }}
    >
      {/* Status icon */}
      <span
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: "3px",
        }}
      >
        <IconComponent
          size={14}
          style={{
            color:
              status === "MISSED"
                ? "#C84B31"
                : status === "FULFILLED"
                ? "#1A6B3C"
                : status === "DUE_TODAY"
                ? "#7A5C00"
                : "#9B9A96",
          }}
        />
      </span>

      {/* Text block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "13px",
            fontWeight: 500,
            color: "#0A0A0A",
            lineHeight: 1.4,
            marginBottom: "3px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {ownerText}
        </p>
        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "11px",
            color:
              status === "MISSED"
                ? "rgba(200,75,49,0.75)"
                : status === "DUE_TODAY"
                ? "rgba(122,92,0,0.75)"
                : "#9B9A96",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sourceText}
        </p>
      </div>

      {/* Badge */}
      <StatusBadge variant={status} />
    </div>
  );
}
