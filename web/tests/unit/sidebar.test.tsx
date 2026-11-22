// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

let mockPath = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/hooks/useLogout", () => ({
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/shared/workspace/WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: ({ collapsed }: { collapsed?: boolean }) => (
    <button type="button" aria-label="Switch workspace" data-collapsed={String(!!collapsed)}>
      Workspace
    </button>
  ),
}));

import { Sidebar } from "@/components/shared/layout/Sidebar/Sidebar";
import { useUIStore } from "@/store/ui.store";
import { useRealtimeStore } from "@/store/realtime.store";

const user: any = { id: "u1", name: "Uzair Sarwar", email: "uzair@rapto.cloud", role: "ADMIN", teamId: "t1", team: null };

beforeAll(() => {
  // Radix ScrollArea observes size changes
  (globalThis as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  mockPath = "/dashboard";
  useUIStore.setState({ sidebarCollapsed: false });
  useRealtimeStore.setState({ connectionStatus: "connected" } as any);
});
afterEach(() => {
  document.cookie = "sidebar:collapsed=; max-age=0; path=/";
});

const renderSidebar = () => render(<Sidebar user={user} team={null} />);

const NAV: Array<[string, string]> = [
  ["Dashboard", "/dashboard"],
  ["Meetings", "/meetings"],
  ["Commitments", "/commitments"],
  ["Action Items", "/action-items"],
  ["Team", "/team"],
  ["Analytics", "/analytics"],
  ["Intelligence", "/intelligence"],
  ["Settings", "/settings"],
];

describe("Sidebar navigation", () => {
  it("keeps every existing route", () => {
    renderSidebar();
    for (const [label, href] of NAV) {
      const link = screen.getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(href);
    }
  });

  it("separates Workspace and Intelligence sections", () => {
    renderSidebar();
    const workspace = screen.getByRole("group", { name: "Workspace" });
    const intelligence = screen.getByRole("group", { name: "Intelligence" });
    expect(within(workspace).getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Dashboard",
      "Meetings",
      "Commitments",
      "Action Items",
      "Team",
      "Analytics",
    ]);
    expect(within(intelligence).getAllByRole("link").map((l) => l.textContent)).toEqual(["Intelligence"]);
  });

  it("anchors Settings below the scrollable navigation", () => {
    renderSidebar();
    const settings = screen.getByRole("link", { name: "Settings" });
    expect(screen.getByRole("group", { name: "Workspace" }).contains(settings)).toBe(false);
    expect(screen.getByRole("group", { name: "Intelligence" }).contains(settings)).toBe(false);
  });

  it("marks only the current route as the active page (including nested routes)", () => {
    mockPath = "/meetings/abc-123";
    renderSidebar();
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual(["Meetings"]);
  });

  it("treats /settings/* as Settings and does not confuse similar prefixes", () => {
    mockPath = "/settings/profile";
    const { unmount } = renderSidebar();
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe("page");
    unmount();

    mockPath = "/team-extras"; // starts with "/team" but is not under it
    renderSidebar();
    expect(screen.getByRole("link", { name: "Team" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("Sidebar collapse", () => {
  it("toggles from the header control and persists the choice in a cookie", () => {
    renderSidebar();
    const aside = screen.getByLabelText("Sidebar");
    expect(aside.getAttribute("data-collapsed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(aside.getAttribute("data-collapsed")).toBe("true");
    expect(document.cookie).toContain("sidebar:collapsed=true");

    const expand = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expand.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(expand);
    expect(aside.getAttribute("data-collapsed")).toBe("false");
  });

  it("toggles with Ctrl+\\", () => {
    renderSidebar();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", ctrlKey: true, bubbles: true }));
    });
    expect(screen.getByLabelText("Sidebar").getAttribute("data-collapsed")).toBe("true");
  });

  it("keeps labels in the DOM when collapsed (accessible names) but hides them visually", () => {
    useUIStore.setState({ sidebarCollapsed: true });
    renderSidebar();
    const link = screen.getByRole("link", { name: "Meetings" });
    expect(link.querySelector("span.opacity-0")?.textContent).toBe("Meetings");
  });

  it("shows a tooltip with the label when a collapsed item gets keyboard focus", async () => {
    useUIStore.setState({ sidebarCollapsed: true });
    renderSidebar();
    fireEvent.focus(screen.getByRole("link", { name: "Commitments" }));
    const tips = await screen.findAllByText("Commitments", { selector: "[data-slot=tooltip-content] span, [data-slot=tooltip-content]" });
    expect(tips.length).toBeGreaterThan(0);
  });

  it("does not render tooltips while expanded", () => {
    renderSidebar();
    fireEvent.focus(screen.getByRole("link", { name: "Commitments" }));
    expect(document.querySelector("[data-slot=tooltip-content]")).toBeNull();
  });

  it("passes the collapsed state to the workspace switcher", () => {
    useUIStore.setState({ sidebarCollapsed: true });
    renderSidebar();
    expect(screen.getByRole("button", { name: "Switch workspace" }).getAttribute("data-collapsed")).toBe("true");
  });
});

describe("Sidebar profile", () => {
  it("shows name and email with an accessible live connection status", () => {
    renderSidebar();
    expect(screen.getByText("Uzair Sarwar")).toBeTruthy();
    expect(screen.getByText("uzair@rapto.cloud")).toBeTruthy();
    expect(screen.getAllByRole("status")[0].textContent).toContain("Connected");
  });

  it("reflects reconnecting and offline states", () => {
    useRealtimeStore.setState({ connectionStatus: "connecting" } as any);
    const { unmount } = renderSidebar();
    expect(screen.getAllByRole("status")[0].textContent).toContain("Reconnecting");
    unmount();

    useRealtimeStore.setState({ connectionStatus: "disconnected" } as any);
    renderSidebar();
    expect(screen.getAllByRole("status")[0].textContent).toContain("Offline");
  });
});
