import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The brand guard.
 *
 * The designer's /issue sheet (src/ui/issue/interface.css) is the visual
 * source of truth; src/ui/aesthetic/theme.css republishes its values as the
 * only tokens the product may use. These tests make it impossible to land —
 * or generate — UI that steps outside that system: raw colors and foreign
 * typefaces anywhere else in src/ui or src/app fail the suite.
 */

const ROOT = join(__dirname, '..', '..')
const SCAN_DIRS = [join(ROOT, 'ui'), join(ROOT, 'app')]

/** Files allowed to state raw values: the token sheet and the designer's own artifacts. */
const RAW_COLOR_ALLOWED = new Set([
  'ui/aesthetic/theme.css',
  'ui/issue/interface.css',
  'ui/issue/interface.html',
  'ui/issue/markup.ts', // renders the designer's interface.html verbatim
])

const BRAND_FONTS = new Set(['Courier Prime', 'Courier New', 'Archivo', 'Caveat', 'Bradley Hand'])

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(path)
    return /\.(css|tsx|ts|html)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** Strip segments that may legitimately carry raw color: data-URI textures and SVG filters. */
function withoutUrlPayloads(source: string): string {
  return source
    .replace(/url\((?:[^()]|\([^()]*\))*\)/g, 'url(…)')
    .replace(/data:image\/svg\+xml[^"'`)]*/g, '')
}

const files = SCAN_DIRS.flatMap(listFiles).map(path => ({
  path: relative(ROOT, path),
  source: readFileSync(path, 'utf8'),
}))

describe('brand guard — la colombe dossier theme', () => {
  it('found the UI sources to scan', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('allows raw colors only in the theme and the designer sheet', () => {
    const offenders: string[] = []
    for (const { path, source } of files) {
      if (RAW_COLOR_ALLOWED.has(path)) continue
      const body = withoutUrlPayloads(source)
      for (const match of body.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g)) {
        // ignore hex-looking ids in TS (e.g. slice of a fingerprint) unless in a style context
        const context = body.slice(Math.max(0, match.index - 60), match.index + 20)
        if (/\.tsx?$/.test(path) && !/(color|background|border|fill|stroke|shadow|style)/i.test(context)) continue
        offenders.push(`${path}: …${context.trim().slice(-70)}`)
      }
    }
    expect(offenders, 'raw colors outside theme.css — use var(--token) or color-mix over tokens').toEqual([])
  })

  it('allows only the three brand typefaces', () => {
    const offenders: string[] = []
    for (const { path, source } of files) {
      if (RAW_COLOR_ALLOWED.has(path)) continue
      for (const match of source.matchAll(/font(?:-family)?\s*:[^;}]*/g)) {
        for (const family of match[0].matchAll(/["']([^"']+)["']/g)) {
          if (!BRAND_FONTS.has(family[1])) offenders.push(`${path}: ${family[1]}`)
        }
      }
    }
    expect(offenders, 'non-brand typeface — use var(--font-typewriter|--font-plate|--font-hand)').toEqual([])
  })

  it('loads webfonts only through the app layout', () => {
    const offenders = files
      .filter(({ path, source }) => source.includes('fonts.googleapis.com') && path !== 'app/layout.tsx')
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('keeps theme.css tokens in sync with the designer\'s interface.css', () => {
    const theme = readFileSync(join(ROOT, 'ui/aesthetic/theme.css'), 'utf8')
    const designer = readFileSync(join(ROOT, 'ui/issue/interface.css'), 'utf8')
    const readTokens = (css: string) => {
      const tokens = new Map<string, string>()
      for (const match of css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g)) {
        if (!tokens.has(match[1])) tokens.set(match[1], match[2].toLowerCase())
      }
      return tokens
    }
    const themeTokens = readTokens(theme)
    const designerTokens = readTokens(designer)
    const drift: string[] = []
    for (const [name, value] of designerTokens) {
      const published = themeTokens.get(name)
      if (published && published !== value) drift.push(`${name}: theme ${published} ≠ designer ${value}`)
      if (!published) drift.push(`${name}: missing from theme.css`)
    }
    expect(drift, 'theme.css must republish the designer tokens verbatim').toEqual([])
  })
})
