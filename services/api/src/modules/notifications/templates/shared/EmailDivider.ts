import { EmailColors } from './email-tokens'

/**
 * Hairline divider. A 1px table cell instead of <hr>: <hr> margins/borders are inconsistent across Outlook and Gmail.
 */
export function renderEmailDivider(): string {
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0; border-collapse: collapse;">
  <tr>
    <td height="1" bgcolor="${EmailColors.borderCard}" class="em-border-bg" style="height: 1px; line-height: 1px; font-size: 1px; mso-line-height-rule: exactly; background-color: ${EmailColors.borderCard};">&nbsp;</td>
  </tr>
</table>`
}
