// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import React from "react";

const hook: Record<string, any> = {};
vi.mock("@/features/onboarding/hooks/useCreateTeamStep", () => ({
  useCreateTeamStep: () => hook,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/onboarding/components/OnboardingStepShell", () => ({
  OnboardingStepShell: ({ children, title }: any) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));
vi.mock("@/features/onboarding/components/OnboardingStepFooter", () => ({
  OnboardingStepFooter: ({ children }: any) => <div>{children}</div>,
}));

import CreateTeamPage from "@/app/onboarding/create-team/page";

function render_(overrides: Record<string, any> = {}) {
  Object.assign(hook, {
    name: "Uzair",
    setName: vi.fn(),
    slug: "uzair",
    setSlug: vi.fn(),
    onSlugBlur: vi.fn(),
    slugLocked: false,
    slugEdited: false,
    slugStatus: "available",
    displayStatus: "available",
    suggestion: null,
    adjustedFrom: null,
    error: null,
    isSubmitting: false,
    hasTeam: false,
    canSubmit: true,
    acceptSuggestion: vi.fn(),
    retryCheck: vi.fn(),
    handleSubmit: vi.fn((e) => e?.preventDefault()),
    ...overrides,
  });
  return render(<CreateTeamPage />);
}

describe("create-team page availability states", () => {
  it("checking", () => {
    render_({ displayStatus: "checking", slugStatus: "checking", canSubmit: false });
    expect(screen.getByRole("status").textContent).toContain("Checking availability…");
    expect((screen.getByRole("button", { name: /continue/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("available", () => {
    render_();
    expect(screen.getByRole("status").textContent).toContain("URL is available");
    expect((screen.getByRole("button", { name: /continue/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("available after auto-adjusting a taken slug", () => {
    render_({ slug: "uzair-1", adjustedFrom: "uzair" });
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain("URL is available");
    expect(text).toContain("“uzair” was taken");
  });

  it("taken, with a one-click suggestion", () => {
    const acceptSuggestion = vi.fn();
    render_({ displayStatus: "taken", slugStatus: "taken", suggestion: "uzair-1", acceptSuggestion, canSubmit: false });
    expect(screen.getByRole("status").textContent).toContain("URL is already taken.");
    fireEvent.click(screen.getByRole("button", { name: "uzair-1" }));
    expect(acceptSuggestion).toHaveBeenCalledWith("uzair-1");
  });

  it("unable to verify, with retry", () => {
    const retryCheck = vi.fn();
    render_({ displayStatus: "error", slugStatus: "error", retryCheck });
    expect(screen.getByRole("status").textContent).toContain("Unable to verify URL.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retryCheck).toHaveBeenCalled();
  });

  it("editing the name and slug calls the hook handlers", () => {
    const setName = vi.fn();
    const setSlug = vi.fn();
    render_({ setName, setSlug });
    fireEvent.change(screen.getByLabelText("Team Name"), { target: { value: "My Team" } });
    fireEvent.change(screen.getByLabelText("Workspace URL Slug"), { target: { value: "my-team" } });
    expect(setName).toHaveBeenCalledWith("My Team");
    expect(setSlug).toHaveBeenCalledWith("my-team");
  });

  it("locks the slug field once a team exists", () => {
    render_({ hasTeam: true, slugLocked: true, displayStatus: "idle", slugStatus: "idle", slug: "acme" });
    const slugInput = screen.getByLabelText("Workspace URL Slug") as HTMLInputElement;
    expect(slugInput.readOnly).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("can't be changed");
  });
});
