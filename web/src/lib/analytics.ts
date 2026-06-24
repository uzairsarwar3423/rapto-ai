/**
 * analytics.ts — Day 10
 *
 * PostHog event tracking wrapper.
 * SSR-safe: checks for window before calling posthog.
 *
 * Usage:
 *   import { trackEvent } from '@/lib/analytics'
 *   trackEvent('hero_cta_click', { cta_text: 'Start free trial', position: 'hero' })
 */

export const trackEvent = (
  event: string,
  properties?: Record<string, unknown>
): void => {
  if (typeof window !== "undefined" && (window as any).posthog) {
    (window as any).posthog.capture(event, properties ?? {});
  }
};

// ── Typed event helpers ──────────────────────────────────────

export const analytics = {
  /** Hero section primary CTA clicked */
  heroCTAClick: () =>
    trackEvent("hero_cta_click", {
      cta_text: "Start free trial",
      position: "hero",
    }),

  /** Nav "Start free trial" button clicked */
  navCTAClick: () =>
    trackEvent("nav_cta_click", { position: "nav" }),

  /** Final CTA "See a demo" button clicked */
  demoRequestClick: () =>
    trackEvent("demo_request_click", { position: "final_cta" }),

  /** Pricing toggle switched */
  pricingToggle: (toggledTo: "annual" | "monthly") =>
    trackEvent("pricing_toggle", { toggled_to: toggledTo }),

  /** FAQ accordion item opened */
  faqOpened: (question: string) =>
    trackEvent("faq_opened", { question: question.slice(0, 50) }),

  /** Pricing plan CTA button clicked */
  pricingPlanClick: (plan: "free" | "starter" | "growth" | "business") =>
    trackEvent("pricing_plan_click", { plan }),

  /** Integration badge hovered */
  integrationBadgeHover: (integration: string) =>
    trackEvent("integration_badge_hover", { integration }),

  /** Testimonials section scrolled into view */
  testimonialSectionReached: () =>
    trackEvent("testimonial_section_reached"),

  /** Case study CTA link clicked */
  caseStudyCTAClick: () =>
    trackEvent("case_study_cta_click", { company: "TechFlow" }),

  /** Mobile sticky CTA bar button clicked */
  mobileCTABarClick: (scrollDepth: number) =>
    trackEvent("mobile_cta_bar_click", { scroll_depth: scrollDepth }),
} as const;
