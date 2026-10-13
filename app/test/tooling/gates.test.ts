import { describe, expect, it } from 'vitest'
// @ts-expect-error - the gates script is plain ESM tooling, deliberately untyped
import * as gates from '../../../.claude/skills/quality-check/scripts/gates.mjs'

/** Build the shape the gates consume from a path and a snippet of source. */
function file(path: string, text: string) {
  return { path, text, lines: text.split('\n') }
}

type Finding = { gate: string; kind: string; rule: string; path: string; line: number }
type Gate = (files: ReturnType<typeof file>[]) => Finding[]

const scan = (gate: string) => (gates as Record<string, Gate>)[gate]

describe('scanAudioAllocations', () => {
  const run = scan('scanAudioAllocations')

  it('allows allocation in a constructor, where buffers are meant to be made', () => {
    const source = file(
      'app/src/audio/dsp/thing.ts',
      [
        'class Thing {',
        '  constructor() {',
        '    this.buffer = new Float32Array(1024)',
        '  }',
        '}',
      ].join('\n'),
    )
    expect(run([source])).toHaveLength(0)
  })

  it('flags allocation in a per-block method', () => {
    const source = file(
      'app/src/audio/dsp/thing.ts',
      [
        'class Thing {',
        '  process(block) {',
        '    const copy = new Float32Array(block.length)',
        '  }',
        '}',
      ].join('\n'),
    )
    expect(run([source])).toHaveLength(1)
  })

  it('flags an array method in a per-block path', () => {
    const source = file(
      'app/src/audio/dsp/thing.ts',
      ['class Thing {', '  detect(frame) {', '    return frame.slice(0, 10)', '  }', '}'].join(
        '\n',
      ),
    )
    expect(run([source])[0].rule).toBe('AU1')
  })

  it('ignores files outside the audio thread', () => {
    const source = file('app/src/engine/judge.ts', 'const copy = new Float32Array(10)')
    expect(run([source])).toHaveLength(0)
  })

  it('ignores an allocation mentioned only in a comment', () => {
    const source = file(
      'app/src/audio/dsp/thing.ts',
      [
        'class Thing {',
        '  process() {',
        '    // never call new Float32Array here',
        '  }',
        '}',
      ].join('\n'),
    )
    expect(run([source])).toHaveLength(0)
  })
})

describe('scanDspWebAudio', () => {
  const run = scan('scanDspWebAudio')

  it('flags a Web Audio reference in DSP', () => {
    expect(run([file('app/src/audio/dsp/x.ts', 'const ctx = new AudioContext()')])).toHaveLength(1)
  })

  it('allows Web Audio in the engine layer that owns it', () => {
    expect(run([file('app/src/audio/AudioEngine.ts', 'new AudioContext()')])).toHaveLength(0)
  })
})

describe('scanUiAudio', () => {
  const run = scan('scanUiAudio')

  it('flags a component building its own audio context', () => {
    expect(
      run([file('app/src/ui/screens/Practice.tsx', 'const c = new AudioContext()')]),
    ).toHaveLength(1)
  })

  it('allows a component that is handed one', () => {
    expect(
      run([file('app/src/ui/screens/Practice.tsx', 'const c = useAudioEngine()')]),
    ).toHaveLength(0)
  })
})

describe('scanBareMidi', () => {
  const run = scan('scanBareMidi')

  it('flags a raw MIDI number in content', () => {
    expect(run([file('app/src/content/drills.ts', '{ midi: 36, startBeat: 0 }')])[0].rule).toBe(
      'MC1',
    )
  })

  it('allows a parsed pitch name', () => {
    expect(
      run([file('app/src/content/drills.ts', "{ midi: parseNote('C2'), startBeat: 0 }")]),
    ).toHaveLength(0)
  })

  it('ignores MIDI numbers outside content, where they are computed', () => {
    expect(run([file('app/src/engine/judge.ts', 'const midi = 36')])).toHaveLength(0)
  })
})

describe('scanProvenance', () => {
  const run = scan('scanProvenance')

  it('flags a song chart with no stated source', () => {
    expect(
      run([file('app/src/content/songs/angel.ts', 'export const angel = { title: "Angel" }')]),
    ).toHaveLength(1)
  })

  it('accepts a chart that cites its source', () => {
    const source = file('app/src/content/songs/angel.ts', "provenance: 'transcribed from ...'")
    expect(run([source])).toHaveLength(0)
  })
})

describe('scanFocusedTests', () => {
  const run = scan('scanFocusedTests')

  // The snippets are assembled rather than written out, so that this file -
  // which the scanner also reads - does not itself contain what it detects.
  const focused = [
    ['describe', '.only('],
    ['it', '.only('],
    ['it', '.skip('],
    ['x', 'it('],
    ['x', 'describe('],
  ].map(([head, tail]) => head + tail)

  it.each(focused)('flags %s', (snippet) => {
    expect(run([file('app/test/a.test.ts', `${snippet}'x', () => {})`)])).toHaveLength(1)
  })

  it('allows an ordinary test', () => {
    expect(run([file('app/test/a.test.ts', "it('works', () => {})")])).toHaveLength(0)
  })
})

describe('scanAnyTypes', () => {
  const run = scan('scanAnyTypes')

  it.each(['const x: any = 1', 'const y = z as any', 'const w = <any>z'])('flags %s', (snippet) => {
    expect(run([file('app/src/engine/judge.ts', snippet)])).toHaveLength(1)
  })

  it('allows unknown', () => {
    expect(run([file('app/src/engine/judge.ts', 'const x: unknown = 1')])).toHaveLength(0)
  })

  it('exempts ambient declaration files', () => {
    expect(run([file('app/src/audio/worklet/env.d.ts', 'declare const x: any')])).toHaveLength(0)
  })
})

describe('scanClientSecrets', () => {
  const run = scan('scanClientSecrets')

  it('flags a literal key in browser code', () => {
    const source = file('app/src/coach/llm.ts', "const apiKey = 'sk-ant-abcdefghijklmnop'")
    expect(run([source])[0].rule).toBe('CO3')
  })

  it('allows reading a key from the environment on the server', () => {
    expect(
      run([file('app/server/index.mjs', 'const key = process.env.ANTHROPIC_API_KEY')]),
    ).toHaveLength(0)
  })
})

describe('scanPitchMathReinvention', () => {
  const run = scan('scanPitchMathReinvention')

  it('flags hand-rolled frequency maths outside the music layer', () => {
    expect(run([file('app/src/ui/Tuner.tsx', 'const f = 440 * Math.pow(2, n / 12)')])).toHaveLength(
      1,
    )
  })

  it('exempts the module that owns pitch arithmetic', () => {
    expect(
      run([file('app/src/music/notes.ts', 'const f = 440 * Math.pow(2, n / 12)')]),
    ).toHaveLength(0)
  })
})

describe('runGates', () => {
  it('returns findings ordered by path and line', () => {
    const files = [
      file('app/src/content/z.ts', 'x\n{ midi: 40 }'),
      file('app/src/content/a.ts', '{ midi: 36 }'),
    ]
    const findings = (gates as unknown as { runGates: Gate }).runGates(files)
    expect(findings.map((f) => f.path)).toEqual(['app/src/content/a.ts', 'app/src/content/z.ts'])
  })

  it('finds nothing in clean source', () => {
    const files = [file('app/src/engine/judge.ts', 'export const x: number = 1')]
    expect((gates as unknown as { runGates: Gate }).runGates(files)).toHaveLength(0)
  })
})
