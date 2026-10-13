import { describe, expect, it } from 'vitest'
import {
  at,
  bars,
  flattenBars,
  midiOf,
  note,
  resolveSignatures,
  steady,
  totalBeats,
} from '../../src/content/authoring'
import { noteName, parseNote } from '../../src/music/notes'
import type { TimeSignature } from '../../src/music/types'

const THREE_FOUR: TimeSignature = [3, 4]
const FOUR_FOUR: TimeSignature = [4, 4]

describe('at', () => {
  it.each([
    { spec: 'E0', string: 0, fret: 0 },
    { spec: 'A3', string: 1, fret: 3 },
    { spec: 'D0', string: 2, fret: 0 },
    { spec: 'G12', string: 3, fret: 12 },
  ])('parses $spec', ({ spec, string, fret }) => {
    expect(at(spec)).toEqual({ string, fret })
  })

  it('tolerates surrounding whitespace', () => {
    expect(at(' A3 ')).toEqual({ string: 1, fret: 3 })
  })

  it('rejects a string letter a bass does not have', () => {
    expect(() => at('B3')).toThrow(/Not a fret position/)
  })

  it('rejects a missing fret number', () => {
    expect(() => at('A')).toThrow(/Not a fret position/)
  })

  it('rejects a fret beyond any neck', () => {
    expect(() => at('A30')).toThrow(/beyond the neck/)
  })
})

describe('midiOf', () => {
  it.each([
    { spec: 'E0', name: 'E1' },
    { spec: 'A0', name: 'A1' },
    { spec: 'A3', name: 'C2' },
    { spec: 'A6', name: 'Eb2' },
    { spec: 'E8', name: 'C2' },
    { spec: 'E10', name: 'D2' },
  ])('turns $spec into $name', ({ spec, name }) => {
    expect(noteName(midiOf(at(spec)))).toBe(name)
  })

  it('agrees with the two ways of playing the same pitch', () => {
    expect(midiOf(at('A3'))).toBe(midiOf(at('E8')))
  })
})

describe('note', () => {
  it('derives the pitch from the position so the two cannot disagree', () => {
    expect(note('A3', 0, 1).midi).toBe(parseNote('C2'))
  })

  it('keeps the position for the fretboard display', () => {
    expect(note('A3', 0, 1).position).toEqual({ string: 1, fret: 3 })
  })

  it('records when the note starts and how long it is held', () => {
    const made = note('A3', 2.5, 0.5)
    expect(made.startBeat).toBe(2.5)
    expect(made.durationBeats).toBe(0.5)
  })

  it('carries a suggested finger when the lesson teaches one', () => {
    expect(note('A3', 0, 1, { finger: 2 }).finger).toBe(2)
  })
})

describe('steady', () => {
  it('puts one note on each consecutive beat', () => {
    expect(steady(['E1', 'E3', 'A0']).map((made) => made.startBeat)).toEqual([0, 1, 2])
  })

  it('starts where it is told to', () => {
    expect(steady(['E1'], 2).map((made) => made.startBeat)).toEqual([2])
  })

  it('spaces notes by the given duration', () => {
    expect(steady(['E1', 'E3'], 0, 0.5).map((made) => made.startBeat)).toEqual([0, 0.5])
  })
})

describe('bars', () => {
  it('numbers from one by default', () => {
    expect(bars([{ notes: [] }, { notes: [] }]).map((bar) => bar.index)).toEqual([1, 2])
  })

  it('numbers from a given first bar', () => {
    expect(bars([{ notes: [] }], 13)[0].index).toBe(13)
  })
})

describe('resolveSignatures', () => {
  it('stamps the chart signature onto bars that do not change it', () => {
    const resolved = resolveSignatures(bars([{ notes: [] }]), THREE_FOUR)
    expect(resolved[0].timeSignature).toEqual(THREE_FOUR)
  })

  it('carries a change forward to later bars', () => {
    const resolved = resolveSignatures(
      bars([{ notes: [] }, { timeSignature: FOUR_FOUR, notes: [] }, { notes: [] }]),
      THREE_FOUR,
    )
    expect(resolved.map((bar) => bar.timeSignature)).toEqual([THREE_FOUR, FOUR_FOUR, FOUR_FOUR])
  })

  it('leaves the original bars untouched', () => {
    const original = bars([{ notes: [] }])
    resolveSignatures(original, THREE_FOUR)
    expect(original[0].timeSignature).toBeUndefined()
  })
})

describe('flattenBars', () => {
  it('turns bar-relative beats into absolute beats', () => {
    const chart = bars([{ notes: [note('E1', 0, 1)] }, { notes: [note('E3', 0, 1)] }])
    expect(flattenBars(chart, THREE_FOUR).map((made) => made.startBeat)).toEqual([0, 3])
  })

  it('accounts for a meter change when placing later bars', () => {
    const chart = bars([
      { notes: [note('E1', 0, 1)] },
      { timeSignature: FOUR_FOUR, notes: [note('E3', 0, 1)] },
      { notes: [note('A0', 0, 1)] },
    ])
    expect(flattenBars(chart, THREE_FOUR).map((made) => made.startBeat)).toEqual([0, 3, 7])
  })

  it('skips bars with no notes without losing their time', () => {
    const chart = bars([{ notes: [] }, { notes: [note('E1', 0, 1)] }])
    expect(flattenBars(chart, FOUR_FOUR)[0].startBeat).toBe(4)
  })
})

describe('totalBeats', () => {
  it('multiplies bars by the beats in each', () => {
    expect(totalBeats(bars([{ notes: [] }, { notes: [] }]), THREE_FOUR)).toBe(6)
  })

  it('accounts for a meter change partway through', () => {
    const chart = bars([{ notes: [] }, { timeSignature: FOUR_FOUR, notes: [] }])
    expect(totalBeats(chart, THREE_FOUR)).toBe(7)
  })
})
