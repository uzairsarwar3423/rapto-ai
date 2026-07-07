import * as Lucide from "lucide-react";
import { LogoIcon } from "@/components/ui/LogoIcon";

const NAV_ITEMS = [
  { iconName: "LayoutDashboard", label: "Dashboard", active: false },
  { iconName: "CheckSquare", label: "Commitments", active: true },
  { iconName: "Zap", label: "Action Items", active: false },
  { iconName: "Mic", label: "Meetings", active: false },
  { iconName: "BarChart3", label: "Analytics", active: false },
  { iconName: "Settings", label: "Settings", active: false },
];

export function MockAppSidebar() {
  return (
    <>
      <aside
        className="mock-sidebar"
        style={{
          width: "180px",
          flexShrink: 0,
          background: "#FAFAF8",
          borderRight: "1px solid #E4E3DF",
          padding: "16px 8px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {/* Rapto icon */}
        <div
          style={{
            padding: "4px 8px 16px",
            borderBottom: "1px solid #E4E3DF",
            marginBottom: "12px",
          }}
        >
          <LogoIcon size={34} />
        </div>

        {NAV_ITEMS.map((item) => {
          const IconComponent = (Lucide as any)[item.iconName];
          return (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 10px",
                borderRadius: "6px",
                background: item.active ? "#FFFFFF" : "transparent",
                borderLeft: item.active ? "2px solid #1A6B3C" : "2px solid transparent",
                cursor: "default",
                transition: "background 150ms ease",
              }}
              className={item.active ? "" : "sidebar-item-inactive"}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: item.active ? "#1A6B3C" : "#9B9A96",
                  width: "16px",
                  flexShrink: 0,
                }}
              >
                {IconComponent && <IconComponent size={14} />}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: "12px",
                  fontWeight: item.active ? 500 : 400,
                  color: item.active ? "#0A0A0A" : "#6B6A67",
                  lineHeight: 1,
                }}
              >
                {item.label}
              </span>
            </div>
          );
        })}

        {/* User avatar at bottom */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: "16px",
            borderTop: "1px solid #E4E3DF",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 10px",
          }}
        >
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: "#E8F5EE",
              border: "1px solid rgba(26,107,60,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 600,
              color: "#1A6B3C",
              flexShrink: 0,
            }}
          >
            AH
          </div>
          <div>
            <p
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "11px",
                fontWeight: 500,
                color: "#0A0A0A",
                lineHeight: 1.2,
              }}
            >
              Ahmed Hassan
            </p>
            <p
              style={{
                fontFamily: "var(--font-sans, system-ui)",
                fontSize: "10px",
                color: "#9B9A96",
                lineHeight: 1.2,
              }}
            >
              Team Lead
            </p>
          </div>
        </div>
      </aside>

      <style>{`
        .mock-sidebar {
          display: flex;
        }
        .sidebar-item-inactive:hover {
          background: rgba(0,0,0,0.03) !important;
        }
        /* Tablet — narrow sidebar */
        @media (max-width: 1024px) {
          .mock-sidebar {
            width: 160px !important;
          }
        }

        /* Mobile — hide sidebar completely, show content only */
        @media (max-width: 768px) {
          .mock-sidebar {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
