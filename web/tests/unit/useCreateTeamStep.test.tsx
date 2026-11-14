// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkSlug = vi.fn();
const createTeam = vi.fn();
const updateTeam = vi.fn();
let mockUser: any = { id: "u1", teamId: null, team: null };

vi.mock("@/features/onboarding/hooks/useOnboarding", () => ({
  useOnboarding: () => ({ checkSlug, createTeam, updateTeam }),
}));
vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser }),
}));
vi.mock("@/lib/api/client", () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { data: { slug: "acme-existing" } } }) },
}));

import { useCreateTeamStep } from "@/features/onboarding/hooks/useCreateTeamStep";

const DEBOUNCE = 300;
const free = (slug: string) => ({ available: true, slug });
const taken = (slug: string, suggestion: string) => ({ available: false, slug, reason: "TAKEN", suggestion });

/** Let the debounce fire and any resolved promises settle. */
const settle = async (ms = DEBOUNCE + 10) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const setup = () => renderHook(() => useCreateTeamStep(vi.fn()));

beforeEach(() => {
  vi.useFakeTimers();
  mockUser = { id: "u1", teamId: null, team: null };
  window.sessionStorage.clear();
  checkSlug.mockReset();
  createTeam.mockReset();
  updateTeam.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("automatic slug generation", () => {
  it.each([
    ["Uzair", "uzair"],
    ["My Team", "my-team"],
    ["Rapto AI", "rapto-ai"],
  ])("%j -> %j as the user types", async (typed, expected) => {
    checkSlug.mockImplementation(async (s: string) => free(s));
    const { result } = setup();
    act(() => result.current.setName(typed));
    expect(result.current.slug).toBe(expected); // instant, before any network call
    await settle();
    expect(result.current.slugStatus).toBe("available");
  });

  it("follows the name keystroke by keystroke until the user edits the slug", async () => {
    checkSlug.mockImplementation(async (s: string) => free(s));
    const { result } = setup();
    act(() => result.current.setName("Ra"));
    act(() => result.current.setName("Rapto"));
    act(() => result.current.setName("Rapto AI"));
    expect(result.current.slug).toBe("rapto-ai");

    act(() => result.current.setSlug("custom-url"));
    act(() => result.current.setName("Something Else"));
    expect(result.current.slug).toBe("custom-url"); // manual edit wins
  });

  it("resumes following the name if the slug field is cleared", async () => {
    checkSlug.mockImplementation(async (s: string) => free(s));
    const { result } = setup();
    act(() => result.current.setName("Acme"));
    act(() => result.current.setSlug("custom"));
    act(() => result.current.setSlug(""));
    act(() => result.current.setName("Acme Corp"));
    expect(result.current.slug).toBe("acme-corp");
  });

  it("empty name leaves the slug empty and idle (no request)", async () => {
    const { result } = setup();
    act(() => result.current.setName(""));
    await settle();
    expect(result.current.slug).toBe("");
    expect(result.current.slugStatus).toBe("idle");
    expect(checkSlug).not.toHaveBeenCalled();
    expect(result.current.canSubmit).toBe(false);
  });

  it("special-character-only names produce no slug", async () => {
    const { result } = setup();
    act(() => result.current.setName("!!!"));
    expect(result.current.slug).toBe("");
    await settle();
    expect(checkSlug).not.toHaveBeenCalled();
  });

  it("a single character is invalid without hitting the API", async () => {
    const { result } = setup();
    act(() => result.current.setName("A"));
    await settle();
    expect(result.current.slugStatus).toBe("invalid");
    expect(checkSlug).not.toHaveBeenCalled();
    expect(result.current.canSubmit).toBe(false);
  });
});

describe("availability checks", () => {
  it("debounces: rapid typing triggers a single request for the final value", async () => {
    checkSlug.mockImplementation(async (s: string) => free(s));
    const { result } = setup();
    for (const v of ["U", "Uz", "Uza", "Uzai", "Uzair"]) {
      act(() => result.current.setName(v));
      await settle(100); // faster than the debounce
    }
    await settle();
    expect(checkSlug).toHaveBeenCalledTimes(1);
    expect(checkSlug).toHaveBeenCalledWith("uzair");
  });

  it("adopts the next free slug automatically when an auto-generated slug is taken", async () => {
    checkSlug.mockResolvedValueOnce(taken("uzair", "uzair-3"));
    const { result } = setup();
    act(() => result.current.setName("Uzair"));
    await settle();

    expect(result.current.slug).toBe("uzair-3");
    expect(result.current.slugStatus).toBe("available");
    expect(result.current.adjustedFrom).toBe("uzair");
    expect(checkSlug).toHaveBeenCalledTimes(1); // server-provided slug is not re-checked
  });

  it("re-derives from the name (not the adopted suffix) when the name keeps changing", async () => {
    checkSlug.mockImplementation(async (s: string) => (s === "uzair" ? taken("uzair", "uzair-1") : free(s)));
    const { result } = setup();
    act(() => result.current.setName("Uzair"));
    await settle();
    expect(result.current.slug).toBe("uzair-1");

    act(() => result.current.setName("Uzair Khan"));
    expect(result.current.slug).toBe("uzair-khan");
    await settle();
    expect(result.current.slugStatus).toBe("available");
    expect(result.current.adjustedFrom).toBeNull();
  });

  it("does NOT override a hand-typed slug: reports taken and offers the suggestion", async () => {
    checkSlug.mockImplementation(async (s: string) => (s === "acme" ? taken("acme", "acme-1") : free(s)));
    const { result } = setup();
    act(() => result.current.setSlug("acme"));
    await settle();

    expect(result.current.slug).toBe("acme");
    expect(result.current.slugStatus).toBe("taken");
    expect(result.current.suggestion).toBe("acme-1");
    expect(result.current.canSubmit).toBe(false);

    act(() => result.current.acceptSuggestion("acme-1"));
    await settle();
    expect(result.current.slug).toBe("acme-1");
    expect(result.current.slugStatus).toBe("available");
    expect(checkSlug).toHaveBeenCalledTimes(1);
  });

  it("ignores outdated responses (slow answer for an old value arrives last)", async () => {
    let resolveOld!: (v: unknown) => void;
    checkSlug.mockImplementation((s: string) =>
      s === "ab"
        ? new Promise((res) => {
            resolveOld = res;
          })
        : Promise.resolve(free(s))
    );
    const { result } = setup();

    act(() => result.current.setName("Ab"));
    await settle(); // request for "ab" is now in flight, unresolved
    act(() => result.current.setName("Abc"));
    await settle(); // request for "abc" resolves: available
    expect(result.current.slug).toBe("abc");
    expect(result.current.slugStatus).toBe("available");

    // The stale answer for "ab" finally lands — and says "taken". It must be discarded.
    await act(async () => {
      resolveOld(taken("ab", "ab-1"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.slug).toBe("abc");
    expect(result.current.slugStatus).toBe("available");
    expect(result.current.suggestion).toBeNull();
  });

  it("blocks submit while checking", async () => {
    checkSlug.mockImplementation(() => new Promise(() => {})); // never settles
    const { result } = setup();
    act(() => result.current.setName("Acme"));
    await settle();
    expect(result.current.slugStatus).toBe("checking");
    expect(result.current.canSubmit).toBe(false);
  });

  it("does not flash 'Checking…' for fast re-checks, but shows it for slow ones", async () => {
    checkSlug.mockImplementationOnce(async (s: string) => free(s));
    const { result } = setup();
    act(() => result.current.setName("Acme"));
    await settle();
    expect(result.current.displayStatus).toBe("available");

    // A slow re-check for the next keystroke
    checkSlug.mockImplementation(() => new Promise(() => {}));
    act(() => result.current.setName("Acme Co"));
    await settle(DEBOUNCE + 10);
    expect(result.current.slugStatus).toBe("checking");
    expect(result.current.displayStatus).toBe("available"); // still the last settled message

    await settle(600); // exceeds the reveal threshold
    expect(result.current.displayStatus).toBe("checking");
  });

  it("reports 'error' on network failure, still allows submit, and recovers on retry", async () => {
    checkSlug.mockRejectedValueOnce(new Error("Network Error"));
    const { result } = setup();
    act(() => result.current.setName("Acme"));
    await settle();
    expect(result.current.slugStatus).toBe("error");
    expect(result.current.canSubmit).toBe(true); // the server revalidates on creation

    checkSlug.mockResolvedValueOnce(free("acme"));
    act(() => result.current.retryCheck());
    await settle();
    expect(result.current.slugStatus).toBe("available");
  });

  it("treats a server INVALID verdict as invalid", async () => {
    checkSlug.mockResolvedValueOnce({ available: false, slug: "xx", reason: "INVALID", suggestion: "workspace" });
    const { result } = setup();
    act(() => result.current.setSlug("xx"));
    await settle();
    expect(result.current.slugStatus).toBe("invalid");
  });
});

describe("submit", () => {
  it("sends the normalised slug and trusts the slug the server returns", async () => {
    checkSlug.mockImplementation(async (s: string) => free(s));
    createTeam.mockResolvedValue({ id: "t1", name: "Rapto AI", slug: "rapto-ai-1", slugAdjusted: true });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useCreateTeamStep(onSuccess));

    act(() => result.current.setName("Rapto AI"));
    await settle();
    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(createTeam).toHaveBeenCalledWith({ name: "Rapto AI", slug: "rapto-ai" });
    expect(result.current.slug).toBe("rapto-ai-1");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("recovers from a server DUPLICATE by offering a suggestion instead of failing", async () => {
    checkSlug.mockImplementation(async (s: string) => free(s));
    createTeam.mockRejectedValue({
      response: { data: { error: { code: "DUPLICATE", details: { field: "slug", suggestion: "acme-9" } } } },
    });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useCreateTeamStep(onSuccess));
    act(() => result.current.setName("Acme"));
    await settle();
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.slugStatus).toBe("taken");
    expect(result.current.suggestion).toBe("acme-9");
  });
});

describe("preserving the slug between onboarding steps", () => {
  it("restores name and slug from the draft after remounting (e.g. Back / Continue)", async () => {
    checkSlug.mockImplementation(async (s: string) => free(s));
    const first = setup();
    act(() => first.result.current.setName("Rapto AI"));
    await settle();
    first.unmount();

    const second = setup();
    await settle();
    expect(second.result.current.name).toBe("Rapto AI");
    expect(second.result.current.slug).toBe("rapto-ai");
    expect(second.result.current.slugStatus).toBe("available");
  });

  it("keeps a manual edit across remounts", async () => {
    checkSlug.mockImplementation(async (s: string) => free(s));
    const first = setup();
    act(() => first.result.current.setName("Rapto AI"));
    act(() => first.result.current.setSlug("my-own-url"));
    await settle();
    first.unmount();

    const second = setup();
    await settle();
    expect(second.result.current.slug).toBe("my-own-url");
    expect(second.result.current.slugEdited).toBe(true);
  });
});

describe("team already exists", () => {
  it("locks the slug, skips availability checks and only updates the name", async () => {
    mockUser = { id: "u1", teamId: "t1", team: { id: "t1", name: "Acme", slug: "acme" } };
    updateTeam.mockResolvedValue({ id: "t1", name: "Acme Inc", slug: "acme" });
    const { result } = setup();
    await settle();

    expect(result.current.slugLocked).toBe(true);
    expect(result.current.slug).toBe("acme");
    act(() => result.current.setSlug("hacked"));
    act(() => result.current.setName("Acme Inc"));
    expect(result.current.slug).toBe("acme"); // name changes never rewrite a live workspace URL
    expect(checkSlug).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(updateTeam).toHaveBeenCalledWith({ name: "Acme Inc" });
  });
});
