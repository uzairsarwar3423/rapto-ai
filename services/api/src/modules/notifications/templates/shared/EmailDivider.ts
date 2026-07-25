import { EmailColors } from './email-tokens'

export function renderEmailDivider(): string {
  return `<hr style="border: none; border-top: 1px solid ${EmailColors.borderCard}; margin: 24px 0;" />`
}
