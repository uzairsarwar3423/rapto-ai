import { EmailColors, EmailTypography } from './email-tokens'
import { esc, safeUrl } from './email-escape'

/**
 * Typography and content building blocks shared by every template.
 *
 * Convention: functions that take `html` expect TRUSTED markup — the caller must have escaped every dynamic value with
 * `esc()` / `safeUrl()`. Functions that take plain `text` / labels escape internally.
 */

const FONT = EmailTypography.fontFamily

/** Page heading (h1). */
export function renderEmailHeading(text: string, subtitle?: string): string {
  return `
<h1 class="em-heading" style="margin: 0 0 ${subtitle ? '6px' : '16px'} 0; font-family: ${FONT}; font-size: ${EmailTypography.fontSizeTitle}; line-height: ${EmailTypography.lineHeightTitle}; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${EmailColors.textHeadline}; letter-spacing: -0.3px;">${esc(text)}</h1>${
    subtitle
      ? `
<p class="em-muted" style="margin: 0 0 20px 0; font-family: ${FONT}; font-size: ${EmailTypography.fontSizeBody}; line-height: ${EmailTypography.lineHeightBody}; color: ${EmailColors.textMuted};">${esc(subtitle)}</p>`
      : ''
  }`
}

/** Body paragraph. `html` is trusted markup (escape dynamic values first). */
export function renderEmailText(html: string): string {
  return `
<p class="em-text" style="margin: 0 0 16px 0; font-family: ${FONT}; font-size: ${EmailTypography.fontSizeBody}; line-height: ${EmailTypography.lineHeightBody}; color: ${EmailColors.textBody};">${html}</p>`
}

/** Secondary / small print paragraph. `html` is trusted markup. */
export function renderEmailMuted(html: string): string {
  return `
<p class="em-muted" style="margin: 0 0 12px 0; font-family: ${FONT}; font-size: ${EmailTypography.fontSizeSmall}; line-height: ${EmailTypography.lineHeightSmall}; color: ${EmailColors.textMuted};">${html}</p>`
}

/** Emphasised inline value inside trusted markup, e.g. `Hi ${strong(name)}`. Escapes its input. */
export function strong(text: unknown): string {
  return `<strong class="em-strong" style="font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${EmailColors.textHeadline};">${esc(text)}</strong>`
}

/** Small uppercase label above a block. */
export function renderEmailEyebrow(text: string, color: string = EmailColors.brandText): string {
  return `<p style="margin: 0 0 6px 0; font-family: ${FONT}; font-size: 12px; line-height: 16px; font-weight: ${EmailTypography.fontWeightSemiBold}; letter-spacing: 0.6px; text-transform: uppercase; color: ${color};">${esc(text)}</p>`
}

export interface EmailDetailRow {
  label: string
  value: string
  /** Emphasise the value (bold, headline colour). */
  strong?: boolean
  /** Render the value in a monospace face (ids, references). */
  mono?: boolean
  /** Override the value colour (e.g. a success amount). */
  color?: string
}

/**
 * Key/value details list (receipts, invitation details). Hairline row separators, label left, value right.
 * Labels and values are plain text and are escaped here.
 */
export function renderEmailDetails(rows: EmailDetailRow[]): string {
  const visible = rows.filter((r) => r.value !== undefined && r.value !== null && String(r.value) !== '')
  const body = visible
    .map((r, i) => {
      const last = i === visible.length - 1
      const rule = last ? '' : `border-bottom: 1px solid ${EmailColors.borderDivider};`
      const valueColor = r.color ?? EmailColors.textHeadline
      const valueWeight = r.strong ? EmailTypography.fontWeightSemiBold : EmailTypography.fontWeightRegular
      const family = r.mono ? EmailTypography.monoFamily : FONT
      return `
  <tr>
    <td class="em-muted em-row-border" valign="top" style="padding: 10px 12px 10px 0; ${rule} font-family: ${FONT}; font-size: 14px; line-height: 20px; color: ${EmailColors.textMuted};">${esc(r.label)}</td>
    <td class="em-strong em-row-border" align="right" valign="top" style="padding: 10px 0; ${rule} font-family: ${family}; font-size: 14px; line-height: 20px; font-weight: ${valueWeight}; color: ${valueColor}; word-break: break-word;">${esc(r.value)}</td>
  </tr>`
    })
    .join('')

  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">${body}
</table>`
}

/** Compact status pill (Role, Plan …). Plain text, escaped. Table-based for Outlook. */
export function renderEmailBadge(text: string, variant: 'neutral' | 'success' | 'warning' | 'danger' = 'neutral'): string {
  const map = {
    neutral: { bg: '#F4F4F5', fg: EmailColors.textHeadline, border: EmailColors.borderCard },
    success: { bg: EmailColors.stateSuccessBg, fg: EmailColors.stateSuccessText, border: '#A7F3D0' },
    warning: { bg: EmailColors.stateWarningBg, fg: EmailColors.stateWarningText, border: '#FDE68A' },
    danger: { bg: EmailColors.stateDangerBg, fg: EmailColors.stateDangerText, border: '#FECACA' },
  }[variant]
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate; display: inline-table;"><tr><td bgcolor="${map.bg}" style="background-color: ${map.bg}; border: 1px solid ${map.border}; border-radius: 999px; padding: 2px 10px; font-family: ${FONT}; font-size: 12px; line-height: 18px; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${map.fg};">${esc(text)}</td></tr></table>`
}

/**
 * Bulleted/checked list. Items are TRUSTED markup (escape dynamic values first). Uses a table instead of <ul> so the
 * marker, spacing and wrapping are identical in Outlook.
 */
export function renderEmailList(itemsHtml: string[], marker: string = '&bull;', markerColor: string = EmailColors.brandText): string {
  const rows = itemsHtml
    .map(
      (item) => `
  <tr>
    <td width="20" valign="top" style="padding: 3px 0; font-family: ${FONT}; font-size: 14px; line-height: 20px; font-weight: ${EmailTypography.fontWeightBold}; color: ${markerColor};">${marker}</td>
    <td valign="top" class="em-text" style="padding: 3px 0; font-family: ${FONT}; font-size: 14px; line-height: 20px; color: ${EmailColors.textBody};">${item}</td>
  </tr>`
    )
    .join('')
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 0 0 16px 0;">${rows}
</table>`
}

export interface EmailStep {
  index: string | number
  title: string
  description: string
}

/** Numbered steps (onboarding checklists). Plain text, escaped. */
export function renderEmailSteps(steps: EmailStep[]): string {
  const rows = steps
    .map((s, i) => {
      const rule = i === steps.length - 1 ? '' : `border-bottom: 1px solid ${EmailColors.borderDivider};`
      return `
  <tr>
    <td width="40" valign="top" style="padding: 14px 0; ${rule}">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse: separate;"><tr><td width="26" height="26" align="center" valign="middle" bgcolor="#F4F4F5" style="width: 26px; height: 26px; background-color: #F4F4F5; border: 1px solid ${EmailColors.borderCard}; border-radius: 13px; font-family: ${FONT}; font-size: 12px; line-height: 26px; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${EmailColors.textHeadline}; text-align: center;">${esc(s.index)}</td></tr></table>
    </td>
    <td valign="top" class="em-row-border" style="padding: 14px 0; ${rule}">
      <p class="em-heading" style="margin: 0 0 2px 0; font-family: ${FONT}; font-size: 14px; line-height: 20px; font-weight: ${EmailTypography.fontWeightSemiBold}; color: ${EmailColors.textHeadline};">${esc(s.title)}</p>
      <p class="em-muted" style="margin: 0; font-family: ${FONT}; font-size: 13px; line-height: 20px; color: ${EmailColors.textMuted};">${esc(s.description)}</p>
    </td>
  </tr>`
    })
    .join('')
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 16px 0 8px 0;">${rows}
</table>`
}

/** "If the button doesn't work, paste this link" block. URL is validated and escaped. */
export function renderEmailLinkFallback(url: string, intro = 'Button not working? Copy and paste this link into your browser:'): string {
  const safe = safeUrl(url)
  if (safe === '#') return '' // unsafe/invalid URL: never print it, never link it
  return `
<p class="em-muted" style="margin: 0 0 6px 0; font-family: ${FONT}; font-size: 12px; line-height: 18px; color: ${EmailColors.textMuted};">${esc(intro)}</p>
<p style="margin: 0 0 16px 0; font-family: ${FONT}; font-size: 12px; line-height: 18px; word-break: break-all;"><a href="${safe}" target="_blank" class="em-link" style="color: ${EmailColors.brandText}; text-decoration: underline;">${esc(url)}</a></p>`
}

/** Inline link inside trusted markup. */
export function link(href: string, text: string): string {
  return `<a href="${safeUrl(href)}" target="_blank" class="em-link" style="color: ${EmailColors.brandText}; text-decoration: underline;">${esc(text)}</a>`
}
