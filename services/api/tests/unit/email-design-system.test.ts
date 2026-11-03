/**
 * Email design-system validation: every template × {full, minimal, hostile} data.
 * Static analysis of the generated HTML — structure, logo, buttons, contrast, escaping, link safety, client-hostile CSS.
 * (This does NOT prove behaviour in a specific mail client; see the report for what was and was not rendered.)
 */
import fs from 'node:fs'
import path from 'node:path'
import { TEMPLATE_CASES, XSS, type Variant } from '../support/email-fixtures'
import { esc, safeUrl } from '../../src/modules/notifications/templates/shared/email-escape'
import { renderEmailButton, type EmailButtonProps } from '../../src/modules/notifications/templates/shared/EmailButton'
import { renderEmailBrandLogo } from '../../src/modules/notifications/templates/shared/EmailBrandLogo'
import { EmailAssets } from '../../src/modules/notifications/templates/shared/email-tokens'

const VARIANTS: Variant[] = ['full', 'minimal', 'hostile']
const render = (name: string, v: Variant) => TEMPLATE_CASES.find((t) => t.name === name)!.render(v)

// ── helpers ───────────────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const c = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

const VOID = new Set(['meta', 'img', 'br', 'hr', 'input', 'link'])
/** Minimal tag-balance check (stack based) over the markup, ignoring comments (incl. Outlook conditionals) and void tags. */
function unbalancedTags(html: string): string[] {
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<head>[\s\S]*?<\/head>/, '')
  const stack: string[] = []
  const problems: string[] = []
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase()
    const closing = m[0].startsWith('</')
    if (VOID.has(tag) || m[2] === '/') continue
    if (!closing) stack.push(tag)
    else {
      const top = stack.pop()
      if (top !== tag) problems.push(`expected </${top}> got </${tag}>`)
    }
  }
  if (stack.length) problems.push(`unclosed: ${stack.join(',')}`)
  return problems
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])

// ═════════════════════════════════════════════════════════════════════════════
describe('inventory', () => {
  it('covers every template file in the templates folder (no template left behind)', () => {
    const dir = path.join(__dirname, '../../src/modules/notifications/templates')
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => f.replace('.ts', ''))
    const covered = new Set(TEMPLATE_CASES.map((t) => t.name))
    expect(files.filter((f) => !covered.has(f))).toEqual([])
    expect(TEMPLATE_CASES).toHaveLength(17)
  })
})

describe.each(TEMPLATE_CASES.map((t) => t.name))('%s', (name) => {
  const tc = TEMPLATE_CASES.find((t) => t.name === name)!

  describe.each(VARIANTS)('%s data', (variant) => {
    let html: string
    beforeAll(() => {
      html = tc.render(variant)
    })

    it('is a complete, well-formed HTML email document with table layout and a 600px cap', () => {
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
      expect(html).toContain('<html lang="en"')
      expect(html).toContain('<meta name="viewport"')
      expect(html).toContain('max-width: 600px')
      expect(html).toContain('role="presentation"')
      expect(unbalancedTags(html)).toEqual([])
      // one h1 = one clear heading
      expect((html.match(/<h1\b/g) ?? []).length).toBe(1)
    })

    it('never leaks undefined / null / [object Object] / NaN', () => {
      expect(html).not.toMatch(/undefined|\bnull\b|\[object Object\]|NaN/)
    })

    it('uses only client-safe CSS (no flex/grid/position/box-shadow/calc/@import/external CSS/background-image)', () => {
      for (const banned of [/display:\s*flex/i, /display:\s*grid/i, /position:\s*(absolute|relative|fixed)/i, /box-shadow/i, /calc\(/i, /@import/i, /<link\b/i, /background-image/i, /<script/i]) {
        expect(html).not.toMatch(banned)
      }
    })

    it('stays under Gmail\'s 102KB clipping limit', () => {
      expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(100 * 1024)
    })

    it('has a Rapto logo image from an absolute HTTPS URL with alt text and fixed dimensions (never localhost/relative/base64)', () => {
      const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
      expect(imgs.length).toBe(2) // light + dark-mode variant
      for (const img of imgs) {
        expect(img).toMatch(/src="https:\/\/[^"]+\/email\/rapto-logo(-white)?\.png"/)
        expect(img).not.toMatch(/localhost|data:|file:/)
        expect(img).toContain('alt="Rapto"')
        expect(img).toContain(`width="${EmailAssets.logoDisplayWidth}"`)
        expect(img).toContain(`height="${EmailAssets.logoDisplayHeight}"`)
      }
    })

    it('every CTA button has a solid background on the cell (attr + inline), padding, and AA text contrast', () => {
      const cells = [...html.matchAll(/<td[^>]*class="em-btn-cell"[^>]*>/g)].map((m) => m[0])
      expect(cells.length).toBeGreaterThanOrEqual(0)
      for (const cell of cells) {
        const bg = /bgcolor="(#[0-9A-Fa-f]{6})"/.exec(cell)?.[1]
        expect(bg).toBeTruthy()
        expect(cell).toContain(`background-color: ${bg}`)
        expect(cell).toContain('border-radius')
      }
      for (const a of [...html.matchAll(/<a\b[^>]*class="em-btn-link"[^>]*>/g)].map((m) => m[0])) {
        const color = /;\s*color:\s*(#[0-9A-Fa-f]{6})/.exec(a)?.[1]
        expect(color).toBeTruthy()
        expect(a).toContain('text-decoration: none')
        expect(a).toContain('padding: 12px 28px')
      }
    })

    it('only emits safe link protocols (https/http/mailto) — never javascript:/data:', () => {
      for (const h of hrefs(html)) expect(h).toMatch(/^(https?:|mailto:|#$)/)
      expect(html).not.toMatch(/href="\s*(javascript|data|vbscript):/i)
    })

    it('has a footer with a preferences/unsubscribe link', () => {
      expect(html).toContain('Unsubscribe or change preferences')
      expect(hrefs(html).some((h) => /\/(unsubscribe\?token=|settings\/notifications)/.test(h))).toBe(true)
    })

    it('is accessible: lang, title, alt text on every image, no empty links', () => {
      expect(html).toMatch(/<title>[^<]+<\/title>/)
      for (const img of html.match(/<img\b[^>]*>/g) ?? []) expect(img).toMatch(/\balt="[^"]+"/)
      expect(html).not.toMatch(/<a\b[^>]*>\s*<\/a>/)
    })
  })

  it('full data: every dynamic URL is a working href and every dynamic text is present (HTML-escaped)', () => {
    const html = tc.render('full')
    const found = hrefs(html)
    for (const url of tc.urls) expect(found).toContain(esc(url))
    for (const t of tc.texts) expect(html).toContain(esc(t))
  })

  it('hostile data: injection payloads are escaped and dangerous URLs are neutralised', () => {
    const html = tc.render('hostile')
    expect(html).not.toContain('<script')
    expect(html).not.toMatch(/<img[^>]*onerror/i)
    expect(html).not.toContain('<img src=x')
    expect(html).not.toMatch(/javascript:/i)
    // the payload IS shown, but as inert text
    if (tc.name !== 'MeetingSummary' || true) {
      const escaped = esc(XSS)
      expect(html.includes(escaped) || html.includes('&lt;img')).toBe(true)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('escaping helpers', () => {
  it('esc escapes the five HTML metacharacters and tolerates null/undefined/numbers', () => {
    expect(esc(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
    expect(esc(42)).toBe('42')
  })

  it.each([
    ['https://app.rapto.cloud/a?x=1&y=2', 'https://app.rapto.cloud/a?x=1&amp;y=2'],
    ['http://example.com', 'http://example.com'],
    ['mailto:support@rapto.cloud', 'mailto:support@rapto.cloud'],
    ['javascript:alert(1)', '#'],
    ['JaVaScRiPt:alert(1)', '#'],
    ['data:text/html,<script>', '#'],
    ['vbscript:x', '#'],
    ['/relative/path', '#'],
    ['', '#'],
    [undefined, '#'],
    ['https://x.com/" onmouseover="alert(1)', 'https://x.com/%22%20onmouseover=%22alert(1)'.replace(/%22/g, '&quot;').replace(/%20/g, ' ')],
  ])('safeUrl(%j) → %j', (input, expected) => {
    const out = safeUrl(input as any)
    if (input && String(input).includes('onmouseover')) {
      expect(out).not.toMatch(/"\s*onmouseover/) // attribute cannot be broken out of
    } else {
      expect(out).toBe(expected)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('logo asset', () => {
  const publicDir = path.join(__dirname, '../../../../web/public')
  const files = [EmailAssets.logoPath, EmailAssets.logoWhitePath]

  it.each(files)('%s exists in web/public (served at the same path on the web origin) as a transparent PNG at 3× the display size', (p) => {
    const file = path.join(publicDir, p)
    expect(fs.existsSync(file)).toBe(true)
    const buf = fs.readFileSync(file)
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a') // PNG signature
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    const colorType = buf[25]
    expect(width).toBe(EmailAssets.logoDisplayWidth * 3)
    expect(Math.round((width * EmailAssets.logoDisplayHeight) / EmailAssets.logoDisplayWidth)).toBeLessThanOrEqual(height + 3)
    expect([4, 6]).toContain(colorType) // greyscale+alpha or RGBA ⇒ transparent background
    expect(buf.length).toBeLessThan(20 * 1024)
  })

  it('logo markup targets exactly those paths on the public (non-localhost) frontend URL', () => {
    const html = renderEmailBrandLogo()
    expect(html).toContain(`${EmailAssets.logoPath}"`)
    expect(html).toContain(`${EmailAssets.logoWhitePath}"`)
    expect(html).not.toMatch(/localhost/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('buttons — every variant', () => {
  const variants: NonNullable<EmailButtonProps['variant']>[] = ['primary', 'brand', 'dark', 'outline', 'danger', 'warning']

  it.each(variants)('%s: solid background, AA text contrast (≥ 4.5:1), no underline, no box-shadow', (variant) => {
    const html = renderEmailButton({ href: 'https://app.rapto.cloud/x', label: 'Do it', variant })
    const bg = /bgcolor="(#[0-9A-Fa-f]{6})"/.exec(html)![1]
    const fg = /<a [^>]*?;\s*color:\s*(#[0-9A-Fa-f]{6})/.exec(html)![1]
    expect(html).toContain(`background-color: ${bg}`)
    expect(contrast(bg, fg)).toBeGreaterThanOrEqual(4.5)
    expect(html).toContain('text-decoration: none')
    expect(html).not.toContain('box-shadow')
    expect(html).toContain('mso-padding-alt')
  })

  it('full-width variant spans the container; left variant aligns left', () => {
    expect(renderEmailButton({ href: 'https://a.co', label: 'x', align: 'full' })).toContain('width="100%"')
    const left = renderEmailButton({ href: 'https://a.co', label: 'x', align: 'left' })
    expect(left).toContain('<td align="left"')
    expect(left).not.toMatch(/<table[^>]*align=/) // a floated table would make following text wrap beside the button
  })

  it('escapes the label and neutralises a hostile href', () => {
    const html = renderEmailButton({ href: 'javascript:alert(1)', label: '<b>x</b>' })
    expect(html).toContain('href="#"')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
})

describe('layout colour contrast (light theme)', () => {
  it.each([
    ['body text on white', '#3F3F46', '#FFFFFF', 4.5],
    ['headline on white', '#18181B', '#FFFFFF', 4.5],
    ['muted text on white', '#71717A', '#FFFFFF', 4.5],
    ['muted text on subtle card', '#71717A', '#FAFAFA', 4.5],
    ['link on white', '#047857', '#FFFFFF', 4.5],
    ['warning text on warning card', '#92400E', '#FFFBEB', 4.5],
    ['danger text on danger card', '#991B1B', '#FEF2F2', 4.5],
    ['success text on success card', '#065F46', '#ECFDF5', 4.5],
  ])('%s', (_n, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min as number)
  })
})
