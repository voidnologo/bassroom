import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../../src/styles/app.css', import.meta.url)),
  'utf8',
)

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`).exec(css)
  if (match === null) throw new Error(`no --${name} token with a hex value in app.css`)
  return match[1]
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
  const linear = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  )
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG 2.1 AA for body text. The small print in this app is all 0.76-0.95rem. */
const AA_NORMAL_TEXT = 4.5

const TEXT_TOKENS = ['text', 'text-muted', 'text-faint']
const SURFACE_TOKENS = ['bg', 'bg-raised', 'bg-sunken']

const pairs = TEXT_TOKENS.flatMap((text) =>
  SURFACE_TOKENS.map((surface) => [text, surface] as const),
)

describe('text colours against the surfaces they are drawn on', () => {
  it.each(pairs)('--%s clears AA on --%s', (text, surface) => {
    expect(contrastRatio(token(text), token(surface))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })
})
