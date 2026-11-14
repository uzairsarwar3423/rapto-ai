import {
  SLUG_MAX_LENGTH,
  isValidSlug,
  slugify,
  toBaseSlug,
  withSuffix,
} from '../../src/utils/slug'

describe('slugify', () => {
  it.each([
    ['Uzair', 'uzair'],
    ['My Team', 'my-team'],
    ['Rapto AI', 'rapto-ai'],
    ['  My   Team! ', 'my-team'],
    ['UPPER lower MiXeD', 'upper-lower-mixed'],
    ['Café Über', 'cafe-uber'],
    ["Rapto's Team", 'raptos-team'],
    ['Café & Co.!!', 'cafe-co'],
    ['--a__b--', 'a-b'],
    ['a - - b', 'a-b'],
    ['100% Real #1', '100-real-1'],
    ['', ''],
    ['!!!', ''],
    ['   ', ''],
    ['日本語', ''],
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('never exceeds the max length and never ends with a hyphen after truncation', () => {
    const long = `${'a'.repeat(49)} bbbb`
    const out = slugify(long)
    expect(out.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH)
    expect(out.endsWith('-')).toBe(false)
    expect(isValidSlug(out)).toBe(true)
  })

  it('tolerates non-string input', () => {
    expect(slugify(undefined as unknown as string)).toBe('')
    expect(slugify(null as unknown as string)).toBe('')
  })
})

describe('isValidSlug', () => {
  it.each([
    ['ab', true],
    ['uzair', true],
    ['my-team-2', true],
    ['a', false],
    ['', false],
    ['-ab', false],
    ['ab-', false],
    ['Ab', false],
    ['a_b', false],
    ['a b', false],
    ['a'.repeat(51), false],
    ['a'.repeat(50), true],
  ])('%j -> %s', (slug, expected) => {
    expect(isValidSlug(slug)).toBe(expected)
  })
})

describe('toBaseSlug', () => {
  it('always yields a valid slug', () => {
    for (const input of ['', '!!!', 'a', 'A', '日本語', 'ok name', 'x'.repeat(200)]) {
      expect(isValidSlug(toBaseSlug(input))).toBe(true)
    }
  })

  it('falls back to "workspace" for unusable input and keeps short bases', () => {
    expect(toBaseSlug('!!!')).toBe('workspace')
    expect(toBaseSlug('a')).toBe('a-workspace')
    expect(toBaseSlug('Rapto AI')).toBe('rapto-ai')
  })
})

describe('withSuffix', () => {
  it('appends a numeric suffix', () => {
    expect(withSuffix('uzair', 1)).toBe('uzair-1')
    expect(withSuffix('uzair', 25)).toBe('uzair-25')
  })

  it('trims the base so the result stays within the limit and valid', () => {
    const base = 'a'.repeat(50)
    const out = withSuffix(base, 123)
    expect(out.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH)
    expect(out.endsWith('-123')).toBe(true)
    expect(isValidSlug(out)).toBe(true)
  })

  it('does not leave a double hyphen when trimming lands on a hyphen', () => {
    const base = `${'a'.repeat(46)}-bcd` // 50 chars, hyphen at index 46
    const out = withSuffix(base, 12)
    expect(out).not.toMatch(/--/)
    expect(isValidSlug(out)).toBe(true)
  })
})
