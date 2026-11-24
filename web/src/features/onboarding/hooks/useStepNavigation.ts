import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Moves to the next onboarding step.
 *
 * The next route is prefetched as soon as the current step mounts, so by the time
 * the user clicks Continue its code and payload are already in the router cache and
 * the transition is immediate. `isNavigating` gives the button instant feedback and
 * blocks a double click from pushing twice.
 */
export function useStepNavigation(nextPath: string) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const navigatingRef = useRef(false);

  useEffect(() => {
    router.prefetch(nextPath);
  }, [router, nextPath]);

  const goNext = useCallback(() => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setIsNavigating(true);
    router.push(nextPath);
  }, [router, nextPath]);

  return { goNext, isNavigating };
}
