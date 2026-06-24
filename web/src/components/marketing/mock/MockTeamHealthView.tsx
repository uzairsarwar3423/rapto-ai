/**
 * MockTeamHealthView.tsx
 * Team health dashboard view — third tab in ProductShowcase.
 */

const TEAM_MEMBERS = [
  {
    initials: "AR",
    name: "Ali Raza",
    role: "Frontend Lead",
    score: 92,
    trend: "+3",
    trendUp: true,
    color: "#1A6B3C",
    bg: "#E8F5EE",
    bar: "#1A6B3C",
  },
  {
    initials: "SK",
    name: "Sara Khan",
    role: "Product Designer",
    score: 75,
    trend: "-2",
    trendUp: false,
    color: "#7A5C00",
    bg: "#FFFBF0",
    bar: "#F59E0B",
  },
  {
    initials: "AH",
    name: "Ahmed Hassan",
    role: "Backend Developer",
    score: 62,
    trend: "-8",
    trendUp: false,
    color: "#C84B31",
    bg: "#FDECEA",
    bar: "#C84B31",
  },
];

export function MockTeamHealthView() {
  return (
    <div
      style={{
        flex: 1,
        padding: "20px 24px",
        overflowY: "auto",
        background: "#FAFAF8",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "#9B9A96",
            lineHeight: 1,
          }}
        >
          Team Health · May 2026
        </p>
        <span
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "10px",
            color: "#9B9A96",
          }}
        >
          Last 4 weeks
        </span>
      </div>

      {/* Overall score */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E4E3DF",
          borderRadius: "8px",
          padding: "12px 16px",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "var(--font-sans, system-ui)",
              fontSize: "11px",
              color: "#9B9A96",
              marginBottom: "4px",
              lineHeight: 1,
            }}
          >
            Team Commitment Score
          </p>
          <p
            style={{
              fontFamily: "var(--font-serif, Georgia, serif)",
              fontSize: "28px",
              color: "#0A0A0A",
              lineHeight: 1,
            }}
          >
            76
            <span
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "12px",
                color: "#9B9A96",
                marginLeft: "4px",
              }}
            >
              / 100
            </span>
          </p>
        </div>
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "#E8F5EE",
            border: "3px solid #1A6B3C",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
          }}
        >
          📈
        </div>
      </div>

      {/* Member rows */}
      <p
        style={{
          fontFamily: "var(--font-sans, system-ui)",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "#9B9A96",
          marginBottom: "10px",
          lineHeight: 1,
        }}
      >
        Individual scores
      </p>

      {TEAM_MEMBERS.map((member) => (
        <div
          key={member.name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 0",
            borderBottom: "1px solid #F2F1EE",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: member.bg,
              border: `1px solid ${member.color}30`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 600,
              color: member.color,
              flexShrink: 0,
              fontFamily: "var(--font-sans, system-ui)",
            }}
          >
            {member.initials}
          </div>

          {/* Name + role */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "12px",
                fontWeight: 500,
                color: "#0A0A0A",
                lineHeight: 1.2,
                marginBottom: "2px",
              }}
            >
              {member.name}
            </p>
            <p
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "10px",
                color: "#9B9A96",
                lineHeight: 1,
              }}
            >
              {member.role}
            </p>
          </div>

          {/* Score bar */}
          <div style={{ width: "80px", flexShrink: 0 }}>
            <div
              style={{
                height: "5px",
                background: "#E4E3DF",
                borderRadius: "100px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${member.score}%`,
                  background: member.bar,
                  borderRadius: "100px",
                  transition: "width 0.6s ease",
                }}
              />
            </div>
          </div>

          {/* Score number */}
          <div style={{ textAlign: "right", flexShrink: 0, width: "44px" }}>
            <p
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "13px",
                fontWeight: 600,
                color: member.color,
                lineHeight: 1,
              }}
            >
              {member.score}
            </p>
            <p
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "10px",
                color: member.trendUp ? "#1A6B3C" : "#C84B31",
                lineHeight: 1,
                marginTop: "2px",
              }}
            >
              {member.trend}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
