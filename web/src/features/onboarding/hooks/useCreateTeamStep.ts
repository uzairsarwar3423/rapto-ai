import { useCallback, useEffect, useRef, useState } from "react";
import { useOnboarding } from "./useOnboarding";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { api } from "@/lib/api/client";
import { SLUG_MIN_LENGTH, sanitizeSlugInput, slugify } from "@/lib/utils/slugify";

/**
 * idle      – nothing to check yet (empty slug)
 * checking  – a check is pending / in flight (submit is blocked)
 * available – the slug is free
 * taken     – manual slug is taken (suggestion offered); auto slugs never end here
 * invalid   – cannot be a slug (too short / unusable)
 * error     – could not verify (network / server); submit is still allowed, the
 *             server re-validates and resolves a free slug on creation
 */
export type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

const DEBOUNCE_MS = 300;
/** Only reveal "Checking…" if the answer is slow — fast checks never flash. */
const SHOW_CHECKING_AFTER_MS = 450;

interface Draft {
  name: string;
  slug: string;
  slugEdited: boolean;
}

const draftKey = (userId?: string) => `rapto:onboarding:team-draft:${userId ?? "anon"}`;

function readDraft(key: string): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      slug: typeof parsed.slug === "string" ? parsed.slug : "",
      slugEdited: !!parsed.slugEdited,
    };
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: Draft) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* storage unavailable (private mode / quota) — draft is a convenience only */
  }
}

export const useCreateTeamStep = (onSuccess: () => void) => {
  const { createTeam, updateTeam, checkSlug } = useOnboarding();
  const { user } = useAuth();

  const key = draftKey(user?.id);
  const hasTeam = !!user?.teamId;

  // ── State ────────────────────────────────────────────────────────────────────
  // The draft is restored in an effect after mount (not in the initial state) so the
  // server render and first client render agree — sessionStorage doesn't exist on the server.
  const [name, setNameState] = useState(() => user?.team?.name || "");
  const [slug, setSlugState] = useState(() => user?.team?.slug || "");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  /** Set when an auto-generated slug was taken and we moved to the next free one. */
  const [adjustedFrom, setAdjustedFrom] = useState<string | null>(null);
  const [showChecking, setShowChecking] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Latest-value refs so the debounced effect never closes over stale callbacks.
  const checkSlugRef = useRef(checkSlug);
  checkSlugRef.current = checkSlug;
  /** Monotonic id — a response is applied only if it belongs to the newest request. */
  const requestIdRef = useRef(0);
  /** A slug the server itself handed us: already known to be free, so don't re-check it. */
  const trustedSlugRef = useRef<string | null>(null);
  /** Last settled status, shown while a fast re-check is in flight (no flicker). */
  const [settled, setSettled] = useState<SlugStatus>("idle");

  // The workspace URL is fixed once a team exists (the API ignores slug updates —
  // changing it would break invitation links and integrations).
  const slugLocked = hasTeam;

  // ── Sync with auth user once it loads ────────────────────────────────────────
  useEffect(() => {
    if (user?.team?.name && !name) setNameState(user.team.name);
  }, [user?.team?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user?.team?.slug && slugLocked) setSlugState(user.team.slug);
  }, [user?.team?.slug, slugLocked]);

  // A team exists but its slug isn't in the auth payload — read it from the existing endpoint.
  useEffect(() => {
    if (!hasTeam || slug) return;
    let cancelled = false;
    api
      .get<{ data: { slug?: string } }>("/teams/me")
      .then((res) => {
        const fetched = res.data?.data?.slug;
        if (!cancelled && fetched) setSlugState(fetched);
      })
      .catch(() => {
        /* purely cosmetic in locked mode */
      });
    return () => {
      cancelled = true;
    };
  }, [hasTeam, slug]);

  // ── Restore the draft so Back / Continue between steps never loses the URL ───
  // (Declared before the persist effect: on mount it must read before anything writes.)
  useEffect(() => {
    const draft = readDraft(key);
    if (!draft) return;
    if (draft.name) setNameState((current) => current || draft.name);
    if (draft.slug) setSlugState((current) => current || draft.slug);
    if (draft.slugEdited) setSlugEdited(true);
  }, [key]);

  // ── Persist the draft ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!name && !slug) return;
    writeDraft(key, { name, slug, slugEdited });
  }, [key, name, slug, slugEdited]);

  // ── Name → slug (live) ───────────────────────────────────────────────────────
  const setName = useCallback(
    (value: string) => {
      setNameState(value);
      setError(null);
      if (!slugLocked && (!slugEdited || slug === "")) {
        trustedSlugRef.current = null;
        setAdjustedFrom(null);
        setSlugState(slugify(value));
      }
    },
    [slugEdited, slug, slugLocked]
  );

  // ── Manual slug edits ────────────────────────────────────────────────────────
  const setSlug = useCallback(
    (value: string) => {
      if (slugLocked) return;
      const next = sanitizeSlugInput(value);
      trustedSlugRef.current = null;
      setAdjustedFrom(null);
      setError(null);
      setSlugState(next);
      // Clearing the field hands control back to the name.
      setSlugEdited(next !== "");
    },
    [slugLocked]
  );

  /** Finish normalising on blur (drops a dangling trailing hyphen). */
  const onSlugBlur = useCallback(() => {
    if (slugLocked) return;
    setSlugState((current) => (current.endsWith("-") ? slugify(current) : current));
  }, [slugLocked]);

  const acceptSuggestion = useCallback((suggested: string) => {
    trustedSlugRef.current = suggested; // came from the server → known free
    setAdjustedFrom(null);
    setSlugEdited(true);
    setSlugState(suggested);
    setSlugStatus("available");
    setSuggestion(null);
  }, []);

  const retryCheck = useCallback(() => setRetryNonce((n) => n + 1), []);

  // ── Debounced availability check ─────────────────────────────────────────────
  useEffect(() => {
    if (slugLocked) {
      setSlugStatus("idle");
      return;
    }

    const candidate = slug.replace(/-+$/, ""); // "my-" is checked as "my" until it's finished
    requestIdRef.current += 1; // invalidates any in-flight response for the previous value
    const myId = requestIdRef.current;
    setShowChecking(false);

    if (!candidate) {
      setSlugStatus("idle");
      setSuggestion(null);
      setAdjustedFrom(null);
      setSettled("idle");
      return;
    }

    if (candidate.length < SLUG_MIN_LENGTH) {
      setSlugStatus("invalid");
      setSuggestion(null);
      setSettled("invalid");
      return;
    }

    // The server just told us this slug is free — nothing to verify.
    if (trustedSlugRef.current === candidate) {
      setSlugStatus("available");
      setSuggestion(null);
      setSettled("available");
      return;
    }

    setSlugStatus("checking");

    const slowTimer = setTimeout(() => {
      if (requestIdRef.current === myId) setShowChecking(true);
    }, DEBOUNCE_MS + SHOW_CHECKING_AFTER_MS);

    const timer = setTimeout(async () => {
      try {
        const res = await checkSlugRef.current(candidate);
        if (requestIdRef.current !== myId) return; // outdated response — ignore

        if (res.available) {
          setSlugStatus("available");
          setSuggestion(null);
          setAdjustedFrom(null);
          setSettled("available");
          return;
        }

        if (res.reason === "INVALID") {
          setSlugStatus("invalid");
          setSuggestion(null);
          setSettled("invalid");
          return;
        }

        if (!slugEdited && res.suggestion) {
          // Auto-generated from the name: silently move to the first free slug.
          trustedSlugRef.current = res.suggestion;
          setAdjustedFrom(candidate);
          setSlugState(res.suggestion);
          setSlugStatus("available");
          setSuggestion(null);
          setSettled("available");
          return;
        }

        // Hand-typed slug that is taken: don't override the user, offer the alternative.
        setSlugStatus("taken");
        setSuggestion(res.suggestion ?? null);
        setSettled("taken");
      } catch {
        if (requestIdRef.current !== myId) return;
        setSlugStatus("error");
        setSuggestion(null);
        setSettled("error");
      } finally {
        if (requestIdRef.current === myId) setShowChecking(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      clearTimeout(slowTimer);
    };
  }, [slug, slugEdited, slugLocked, retryNonce]);

  // While a fast re-check is in flight keep showing the last settled message instead
  // of flashing "Checking…" on every keystroke.
  const displayStatus: SlugStatus =
    slugStatus === "checking" && !showChecking && settled !== "idle"
      ? settled
      : slugStatus;

  const trimmedName = name.trim();
  const hasUsableSlug = slug.replace(/-+$/, "").length >= SLUG_MIN_LENGTH;
  const canSubmit =
    !isSubmitting &&
    trimmedName.length >= 2 &&
    (slugLocked ||
      (hasUsableSlug &&
        slugStatus !== "checking" &&
        slugStatus !== "invalid" &&
        slugStatus !== "taken"));

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!trimmedName) {
      setError("Team name is required");
      return;
    }

    if (!slugLocked) {
      if (!hasUsableSlug) {
        setError("Workspace URL needs at least 2 letters or numbers.");
        return;
      }
      if (slugStatus === "invalid") {
        setError("URL must use letters, numbers and hyphens only.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (hasTeam) {
        await updateTeam({ name: trimmedName });
      } else {
        const finalSlug = slugify(slug);
        // The server revalidates and may move to the next free slug; its answer wins.
        const created = await createTeam({ name: trimmedName, slug: finalSlug });
        if (created?.slug) {
          setSlugState(created.slug);
          writeDraft(key, { name: trimmedName, slug: created.slug, slugEdited });
        }
      }
      onSuccess();
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      if (errorData?.code === "DUPLICATE" && errorData?.details?.field === "slug") {
        // Could not reserve the URL even after server-side retries — let the user pick.
        setSlugStatus("taken");
        setSuggestion(errorData.details.suggestion || null);
      } else {
        setError(errorData?.message || "Failed to save team workspace.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    name,
    setName,
    slug,
    setSlug,
    onSlugBlur,
    slugEdited,
    slugLocked,
    /** Accurate status — use for gating. */
    slugStatus,
    /** Flicker-free status — use for the message. */
    displayStatus,
    suggestion,
    adjustedFrom,
    error,
    isSubmitting,
    isCheckingSlug: slugStatus === "checking",
    hasTeam,
    canSubmit,
    acceptSuggestion,
    retryCheck,
    handleSubmit,
  };
};
