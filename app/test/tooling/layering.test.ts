import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Enforces the layer table in CLAUDE.md (TY6).
 *
 * A cycle through a higher layer is the failure this exists for: it makes the
 * lower layer impossible to test without a browser, and it is invisible until
 * someone tries.
 */

const SOURCE_ROOT = resolve(__dirname, '../../src')

interface LayerRule {
  /** Directory under src/, relative. */
  layer: string
  /** Layers this one may not import from. */
  forbidden: string[]
  reason: string
}

const RULES: LayerRule[] = [
  {
    layer: 'audio/dsp',
    forbidden: [
      'audio/AudioEngine',
      'music',
      'engine',
      'content',
      'progress',
      'coach',
      'ui',
      'state',
    ],
    reason: 'DSP is pure signal processing and is tested in plain Node',
  },
  {
    layer: 'music',
    forbidden: ['audio', 'engine', 'content', 'progress', 'coach', 'ui', 'state'],
    reason: 'pitch and fretboard primitives are the bottom of the stack',
  },
  {
    layer: 'engine',
    forbidden: [
      'ui',
      'state',
      'content',
      'coach',
      'progress',
      'audio/AudioEngine',
      'audio/Metronome',
      'audio/latency',
      'audio/dsp',
      'audio/worklet',
    ],
    reason: 'judging is pure, and reaches the audio layer only through audio/contracts',
  },
  {
    layer: 'state',
    forbidden: ['ui'],
    reason: 'the store and the service wiring are what the UI depends on, not the reverse',
  },
  {
    layer: 'progress',
    forbidden: ['ui', 'state', 'audio', 'coach'],
    reason: 'progress rules are pure state transitions',
  },
  {
    layer: 'coach',
    forbidden: ['ui', 'state', 'progress'],
    reason: 'feedback providers depend on telemetry, not on the app around them',
  },
  {
    layer: 'content',
    forbidden: ['ui', 'state', 'audio', 'coach', 'progress'],
    reason: 'content is data and must stay loadable on its own',
  },
]

function sourceFilesUnder(directory: string): string[] {
  const absolute = join(SOURCE_ROOT, directory)
  const found: string[] = []
  const walk = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const child = join(path, entry)
      if (statSync(child).isDirectory()) walk(child)
      else if (/\.tsx?$/.test(child) && !child.endsWith('.d.ts')) found.push(child)
    }
  }
  walk(absolute)
  return found
}

/** Import specifiers in a file, resolved to a path relative to src/. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
  return specifiers
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => relative(SOURCE_ROOT, resolve(join(file, '..'), specifier)))
}

describe.each(RULES)('$layer', ({ layer, forbidden, reason }) => {
  const files = sourceFilesUnder(layer)

  it('still has source files, so the rule below is not vacuous', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(forbidden)(`does not import from %s, because ${reason}`, (banned) => {
    const offenders = files.flatMap((file) =>
      importsOf(file)
        .filter((target) => target === banned || target.startsWith(`${banned}/`))
        .map((target) => `${relative(SOURCE_ROOT, file)} -> ${target}`),
    )
    expect(offenders).toEqual([])
  })
})

describe('the UI layer', () => {
  it('never reaches into the worklet, which only the audio layer may load', () => {
    const offenders = sourceFilesUnder('ui').filter((file) =>
      importsOf(file).some((target) => target.startsWith('audio/worklet')),
    )
    expect(offenders).toEqual([])
  })
})
