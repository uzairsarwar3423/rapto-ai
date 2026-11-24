export interface OnboardingStep {
  path: string;
  order: number;
  label: string;
  optional: boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { path: "/onboarding", order: 1, label: "Welcome", optional: false },
  { path: "/onboarding/create-team", order: 2, label: "Create team", optional: false },
  { path: "/onboarding/invite-team", order: 3, label: "Invite team", optional: true },
  { path: "/onboarding/connect-calendar", order: 4, label: "Connect calendar", optional: true },
] as const;

export const ONBOARDING_COMPLETE_PATH = "/onboarding/complete";

/**
 * Where a signed-in user belongs. Navigating here directly avoids bouncing through
 * /dashboard (and loading its route) only for AuthGuard to redirect back.
 */
export function getPostAuthPath(user: { teamId: string | null; onboardingCompleted?: boolean }): string {
  if (user.onboardingCompleted) return "/dashboard";
  return user.teamId ? "/onboarding/connect-calendar" : "/onboarding";
}
