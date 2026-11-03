import { EmailAssets } from './email-tokens'
import { getFrontendUrl } from '../../email.service'
import { esc, safeUrl } from './email-escape'

/**
 * Rapto logo as a real image, from a public absolute HTTPS URL.
 *
 * WHY an image: the previous header drew the wordmark with CSS (`position:absolute` dot, `box-shadow`, nested
 * inline-blocks). Gmail and Outlook drop those properties, so the dot detached from the "o" or vanished.
 *
 * The asset is the existing wordmark (Space Grotesk "Rapto" + #22c55e dot, as in web NavLogo) rendered to a
 * transparent PNG at 3× for high-DPI, displayed at a fixed 96×39. A white variant is swapped in for dark mode where
 * the client honours prefers-color-scheme (Apple Mail, iOS Mail, Outlook.com); other clients keep the dark logo on
 * the explicit white header.
 *
 * The URL is built from getFrontendUrl(), which never returns localhost.
 */
export function renderEmailBrandLogo(): string {
  const base = getFrontendUrl()
  const lightSrc = esc(`${base}${EmailAssets.logoPath}`)
  const darkSrc = esc(`${base}${EmailAssets.logoWhitePath}`)
  const w = EmailAssets.logoDisplayWidth
  const h = EmailAssets.logoDisplayHeight
  const common = `width="${w}" height="${h}" alt="${esc(EmailAssets.logoAlt)}"`
  const imgStyle = `border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; width: ${w}px; height: ${h}px;`

  return (
    `<a href="${safeUrl(base)}" target="_blank" style="text-decoration: none; border: 0;">` +
    `<img class="em-logo-light" src="${lightSrc}" ${common} style="display: block; ${imgStyle}" />` +
    `<img class="em-logo-dark" src="${darkSrc}" ${common} style="display: none; max-height: 0; overflow: hidden; mso-hide: all; ${imgStyle}" />` +
    `</a>`
  )
}
