/**
 * Email Design System — Token Definitions
 * Single source of truth for email styling: colour, typography, spacing, brand assets.
 *
 * Design language: premium minimalist SaaS (Vercel / Linear / Stripe): white page, zinc neutrals, hairline borders,
 * one accent (Rapto emerald) used for the primary action and the logo dot. Colours chosen for WCAG AA contrast.
 */

export const EmailColors = {
  // Brand
  brandPrimary: '#10B981',  // Rapto emerald (logo dot, accents)
  brandAction: '#047857',   // Emerald 700 — primary button background: white text = 5.5:1 (AA)
  brandActionBorder: '#065F46',
  brandHover: '#059669',
  brandLight: '#ECFDF5',
  brandText: '#047857',     // accent TEXT on white (links) — AA

  // Neutral palette
  bgOuter: '#FFFFFF',       // page background (clean white)
  bgCard: '#FFFFFF',
  bgSubtle: '#FAFAFA',      // information cards / stat tiles (Zinc 50)
  textHeadline: '#18181B',  // Zinc 900
  textBody: '#3F3F46',      // Zinc 700  (10.4:1 on white)
  textMuted: '#71717A',     // Zinc 500  (4.8:1 on white — AA)
  textFooter: '#71717A',
  borderCard: '#E4E4E7',    // Zinc 200 hairline
  borderDivider: '#EDEDEF',

  // State colours — communicate state, not decoration
  stateWarningBg: '#FFFBEB',
  stateWarningBorder: '#F59E0B',
  stateWarningText: '#92400E',

  stateDangerBg: '#FEF2F2',
  stateDangerBorder: '#EF4444',
  stateDangerText: '#991B1B',

  stateSuccessBg: '#ECFDF5',
  stateSuccessBorder: '#10B981',
  stateSuccessText: '#065F46',

  stateInfoBg: '#EFF6FF',
  stateInfoBorder: '#3B82F6',
  stateInfoText: '#1E40AF',
} as const

export const EmailTypography = {
  // System stack: web fonts are not reliable in Gmail/Outlook. Arial is the Outlook-desktop fallback.
  fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
  monoFamily: `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`,
  fontSizeTitle: '22px',
  fontSizeHeading: '16px',
  fontSizeBody: '15px',
  fontSizeSmall: '13px',
  fontSizeMicro: '12px',
  lineHeightTitle: '30px',
  lineHeightBody: '24px',
  lineHeightSmall: '20px',
  fontWeightRegular: '400',
  fontWeightMedium: '500',
  fontWeightSemiBold: '600',
  fontWeightBold: '700',
} as const

export const EmailSpacing = {
  containerMaxWidth: '600px',
  containerWidth: 600,
  paddingCard: '32px 0 8px 0',
  paddingCardMobile: '24px 0 8px 0',
  paddingButton: '12px 24px',
  borderRadiusCard: '8px',
  borderRadiusButton: '8px',
  borderRadiusCallout: '8px',
} as const

/**
 * Brand image assets. They are served by the Rapto web app from /public/email (static, unauthenticated) and must be
 * reachable over absolute HTTPS from the recipient's mail client. PNG, not SVG: Gmail and Outlook do not render SVG.
 * Files are 3× the displayed size for high-DPI screens; the display size is fixed with width/height attributes.
 */
export const EmailAssets = {
  logoPath: '/email/rapto-logo.png',            // dark wordmark, transparent — for light backgrounds
  logoWhitePath: '/email/rapto-logo-white.png', // white wordmark, transparent — for dark mode
  logoDisplayWidth: 96,
  logoDisplayHeight: 39,                         // 288×116 source → 96×38.7
  logoAlt: 'Rapto',
} as const
