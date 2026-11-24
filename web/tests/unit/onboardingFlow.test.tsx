// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const router = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const completeOnboarding = vi.fn();
vi.mock("@/features/onboarding/hooks/useOnboarding", () => ({
  useOnboarding: () => ({ completeOnboarding }),
}));

import { useAuthStore } from "@/features/auth/store/auth.store";
import { useStepNavigation } from "@/features/onboarding/hooks/useStepNavigation";
import { getPostAuthPath } from "@/features/onboarding/data/onboarding-steps.config";
import OnboardingCompletePage from "@/app/onboarding/complete/page";

const baseUser = {
  id: "u1",
  name: "U",
  email: "u@x.dev",
  role: "ADMIN" as const,
  teamId: "t1",
  team: { id: "t1", name: "Acme", slug: "acme" },
  avatarUrl: null,
  timezone: "UTC",
  onboardingCompleted: false,
};

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  router.prefetch.mockReset();
  completeOnboarding.mockReset();
  useAuthStore.setState({ user: { ...baseUser } as any, isAuthenticated: true, isLoading: false });
});

describe("getPostAuthPath", () => {
  it("sends each user straight to where they belong", () => {
    expect(getPostAuthPath({ teamId: null, onboardingCompleted: false })).toBe("/onboarding");
    expect(getPostAuthPath({ teamId: "t1", onboardingCompleted: false })).toBe("/onboarding/connect-calendar");
    expect(getPostAuthPath({ teamId: "t1", onboardingCompleted: true })).toBe("/dashboard");
  });
});

describe("useStepNavigation", () => {
  it("prefetches the next step on mount", () => {
    renderHook(() => useStepNavigation("/onboarding/invite-team"));
    expect(router.prefetch).toHaveBeenCalledWith("/onboarding/invite-team");
  });

  it("navigates immediately and only once on a double click", () => {
    const { result } = renderHook(() => useStepNavigation("/onboarding/invite-team"));
    act(() => {
      result.current.goNext();
      result.current.goNext();
    });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/onboarding/invite-team");
    expect(result.current.isNavigating).toBe(true);
  });
});

describe("onboarding completion screen", () => {
  it("redirects to the dashboard as soon as completion is saved — no fixed delay", async () => {
    completeOnboarding.mockResolvedValue({});
    vi.useFakeTimers();
    try {
      render(<OnboardingCompletePage />);
      // Flush the resolved save without advancing any timers.
      await act(async () => {});
      expect(completeOnboarding).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith("/dashboard");
      expect(router.prefetch).toHaveBeenCalledWith("/dashboard");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not re-save when onboarding is already complete (refresh on this page)", async () => {
    useAuthStore.setState({ user: { ...baseUser, onboardingCompleted: true } as any });
    render(<OnboardingCompletePage />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("shows an error with a working retry when the save fails", async () => {
    completeOnboarding.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({});
    render(<OnboardingCompletePage />);

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(router.replace).not.toHaveBeenCalled();

    fireEvent.click(retry);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(completeOnboarding).toHaveBeenCalledTimes(2);
  });
});
