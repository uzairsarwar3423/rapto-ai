/**
 * Email Design System — Token Definitions
 * Single source of truth for email styling parameters: typography, color palette, and spacing.
 * Standardized based on SaaS transactional email best practices (Linear, Stripe, Vercel, GitHub, Notion).
 */

export const EmailColors = {
  // Brand tokens
  brandPrimary: '#10B981', // Vocaply primary emerald green
  brandHover: '#059669',
  brandLight: '#ECFDF5',

  // Neutral palette
  bgOuter: '#F4F4F5', // Light neutral outer background (Zinc 100)
  bgCard: '#FFFFFF',  // White inner card background
  textHeadline: '#18181B', // Dark charcoal headline (Zinc 900)
  textBody: '#3F3F46',     // Readable neutral body text (Zinc 700)
  textMuted: '#71717A',    // Subtitle & secondary text (Zinc 500)
  textFooter: '#A1A1AA',   // Footer microcopy text (Zinc 400)
  borderCard: '#E4E4E7',   // Soft card border (Zinc 200)
  borderDivider: '#F4F4F5',// Soft horizontal divider line

  // State colors (Stripe-style: communicate state, not decoration)
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
  fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
  fontSizeTitle: '20px',
  fontSizeHeading: '16px',
  fontSizeBody: '14px',
  fontSizeSmall: '12px',
  lineHeightTitle: '28px',
  lineHeightBody: '22px',
  fontWeightRegular: '400',
  fontWeightMedium: '500',
  fontWeightSemiBold: '600',
  fontWeightBold: '700',
} as const

export const EmailSpacing = {
  containerMaxWidth: '580px',
  paddingCard: '32px 28px',
  paddingCardMobile: '24px 16px',
  paddingButton: '12px 24px',
  borderRadiusCard: '8px',
  borderRadiusButton: '6px',
  borderRadiusCallout: '6px',
} as const
