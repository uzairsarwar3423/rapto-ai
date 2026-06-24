"use client";

/**
 * ProductShowcase.tsx
 * Full-section component with 3-tab switcher + MockBrowserFrame.
 * Uses Framer Motion AnimatePresence for smooth tab transitions.
 * Fully responsive across all breakpoints.
 */

import { AnimatePresence, motion } from "framer-motion";
import { SectionLabel } from "@/components/marketing/ui/SectionLabel";
import { MockBrowserFrame } from "@/components/marketing/mock/MockBrowserFrame";
import { MockAppSidebar } from "@/components/marketing/mock/MockAppSidebar";
import { MockCommitmentsView } from "@/components/marketing/mock/MockCommitmentsView";
import { MockMeetingView } from "@/components/marketing/mock/MockMeetingView";
import { MockTeamHealthView } from "@/components/marketing/mock/MockTeamHealthView";
import { useProductShowcaseTabs } from "@/hooks/marketing/useProductShowcaseTabs";
import {
  productTabs,
  showcaseCaption,
} from "@/lib/marketing/content/product-tabs.content";

/** Maps tab ID → which view component to render */
function TabContent({ tabId }: { tabId: string }) {
  switch (tabId) {
    case "commitments":
      return (
        <>
          <MockAppSidebar />
          <MockCommitmentsView />
        </>
      );
    case "meeting-detail":
      return (
        <>
          <MockAppSidebar />
          <MockMeetingView />
        </>
      );
    case "team-health":
      return (
        <>
          <MockAppSidebar />
          <MockTeamHealthView />
        </>
      );
    default:
      return null;
  }
}

export function ProductShowcase() {
  const { activeTab, activeTabData, setActiveTab } =
    useProductShowcaseTabs(productTabs);

  return (
    <section
      id="product-showcase"
      aria-label="Product showcase"
      style={{
        background: "#FFFFFF",
        paddingTop: "clamp(52px, 8vw, 100px)",
        paddingBottom: "clamp(52px, 8vw, 100px)",
        paddingLeft: "var(--pad)",
        paddingRight: "var(--pad)",
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* ── Section label ──────────────────────────────────── */}
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <SectionLabel>Product</SectionLabel>
        </div>

        {/* ── Headline ───────────────────────────────────────── */}
        <h2 className="showcase-headline">
          Your standups, turned into{" "}
          <em style={{ fontStyle: "italic", color: "#1A6B3C" }}>
            automatic accountability.
          </em>
        </h2>

        {/* ── Tab switcher ───────────────────────────────────── */}
        <div className="tab-switcher-wrap">
          <div
            role="tablist"
            aria-label="Product views"
            className="tab-switcher"
          >
            {productTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`tabpanel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    fontFamily: "var(--font-sans, system-ui)",
                    fontWeight: isActive ? 500 : 400,
                    borderRadius: "6px",
                    background: isActive ? "#FFFFFF" : "transparent",
                    color: isActive ? "#0A0A0A" : "#6B6A67",
                    boxShadow: isActive
                      ? "0 1px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)"
                      : "none",
                    cursor: "pointer",
                    border: "none",
                    transition: "all 150ms ease",
                    whiteSpace: "nowrap",
                    lineHeight: 1,
                  }}
                  className={`tab-btn ${isActive ? "tab-btn-active" : "tab-btn-inactive"}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Browser frame with animated tab content ─────────── */}
        <div
          style={{
            maxWidth: "960px",
            margin: "0 auto",
            width: "100%",
          }}
        >
          <MockBrowserFrame urlText={activeTabData.urlBarText}>
            <div
              id={`tabpanel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`tab-${activeTab}`}
              style={{
                display: "flex",
                flex: 1,
                width: "100%",
                overflow: "hidden",
                minWidth: 0,
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.16, ease: "easeInOut" }}
                  style={{ display: "flex", width: "100%", flex: 1, minWidth: 0 }}
                >
                  <TabContent tabId={activeTab} />
                </motion.div>
              </AnimatePresence>
            </div>
          </MockBrowserFrame>
        </div>

        {/* ── Caption ────────────────────────────────────────── */}
        <p
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: "14px",
            color: "#6B6A67",
            textAlign: "center",
            marginTop: "20px",
            maxWidth: "520px",
            marginLeft: "auto",
            marginRight: "auto",
            lineHeight: 1.6,
            padding: "0 8px",
          }}
        >
          {showcaseCaption}
        </p>
      </div>

      <style>{`

        /* ── Headline ─────────────────────────────────────────── */
        .showcase-headline {
          font-family: var(--font-serif, Georgia, serif);
          font-size: clamp(26px, 3.5vw, 44px);
          line-height: 1.1;
          letter-spacing: -0.8px;
          color: #0A0A0A;
          text-align: center;
          margin-bottom: 36px;
          max-width: 560px;
          margin-left: auto;
          margin-right: auto;
        }

        /* ── Tab switcher container ───────────────────────────── */
        .tab-switcher-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 24px;
          padding: 0 4px;
        }

        .tab-switcher {
          display: inline-flex;
          background: #F2F1EE;
          border-radius: 8px;
          padding: 4px;
          gap: 2px;
          max-width: 100%;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .tab-switcher::-webkit-scrollbar {
          display: none;
        }

        .tab-btn {
          font-size: 13px;
          padding: 7px 16px;
          flex-shrink: 0;
        }

        .tab-btn-inactive:hover {
          color: #0A0A0A !important;
          background: rgba(0,0,0,0.04) !important;
        }

        /* ── Mobile  ≤ 768px ─────────────────────────────────── */
        @media (max-width: 768px) {
          .showcase-headline {
            font-size: clamp(24px, 6vw, 36px);
            margin-bottom: 24px;
            padding: 0 4px;
          }

          .tab-btn {
            font-size: 12px;
            padding: 6px 12px;
          }

          .tab-switcher-wrap {
            margin-bottom: 16px;
          }
        }

        /* ── Small mobile  ≤ 480px ───────────────────────────── */
        @media (max-width: 480px) {
          .showcase-headline {
            font-size: clamp(22px, 7vw, 30px);
          }

          .tab-btn {
            font-size: 11px;
            padding: 5px 10px;
          }
        }

      `}</style>
    </section>
  );
}
