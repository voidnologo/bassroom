import { describe, expect, it } from 'vitest'
import {
  barPositionAt,
  beatsPerBarAt,
  countInBeatsOf,
  musicEndBeat,
  signatureAt,
  type MeterChange,
} from '../../src/music/meter'
import { note } from '../../src/content/authoring'
import type { TimeSignature } from '../../src/music/types'

const THREE_FOUR: TimeSignature = [3, 4]
const FOUR_FOUR: TimeSignature = [4, 4]

/** The hymn: eleven bars of 3/4, then 4/4 from bar 12. */
const HYMN: MeterChange[] = [{ atBeat: 33, timeSignature: FOUR_FOUR }]

describe('barPositionAt without a meter change', () => {
  it.each([
    { beat: 0, bar: 1, beatInBar: 1 },
    { beat: 2, bar: 1, beatInBar: 3 },
    { beat: 3, bar: 2, beatInBar: 1 },
    { beat: 11, bar: 4, beatInBar: 3 },
  ])('puts beat $beat at bar $bar beat $beatInBar in three-four', ({ beat, bar, beatInBar }) => {
    expect(barPositionAt(beat, THREE_FOUR)).toEqual({ bar, beatInBar })
  })

  it('keeps an offbeat as a fraction', () => {
    expect(barPositionAt(1.5, FOUR_FOUR).beatInBar).toBe(2.5)
  })
})

describe('barPositionAt across a meter change', () => {
  it('counts the last bar before the change correctly', () => {
    expect(barPositionAt(30, THREE_FOUR, HYMN)).toEqual({ bar: 11, beatInBar: 1 })
  })

  it('starts the new meter on a new bar', () => {
    expect(barPositionAt(33, THREE_FOUR, HYMN)).toEqual({ bar: 12, beatInBar: 1 })
  })

  it('uses the new bar length after the change', () => {
    // Three beats past the change is still inside the first four-four bar.
    expect(barPositionAt(36, THREE_FOUR, HYMN)).toEqual({ bar: 12, beatInBar: 4 })
    expect(barPositionAt(37, THREE_FOUR, HYMN)).toEqual({ bar: 13, beatInBar: 1 })
  })

  it('does not drift over a long four-four section', () => {
    // Dividing by one figure put every bar past the change one beat out, and
    // the error grew; this is the end of the hymn.
    expect(barPositionAt(85, THREE_FOUR, HYMN)).toEqual({ bar: 25, beatInBar: 1 })
  })

  it('is unaffected by a change that has not happened yet', () => {
    expect(barPositionAt(5, THREE_FOUR, HYMN)).toEqual(barPositionAt(5, THREE_FOUR))
  })

  it('handles changes given out of order', () => {
    const shuffled: MeterChange[] = [
      { atBeat: 40, timeSignature: THREE_FOUR },
      { atBeat: 12, timeSignature: FOUR_FOUR },
    ]
    expect(barPositionAt(12, THREE_FOUR, shuffled)).toEqual({ bar: 5, beatInBar: 1 })
  })
})

describe('signatureAt and beatsPerBarAt', () => {
  it('reports the base signature before any change', () => {
    expect(signatureAt(0, THREE_FOUR, HYMN)).toEqual(THREE_FOUR)
  })

  it('reports the new signature from the beat it takes effect', () => {
    expect(signatureAt(33, THREE_FOUR, HYMN)).toEqual(FOUR_FOUR)
    expect(beatsPerBarAt(50, THREE_FOUR, HYMN)).toBe(4)
  })
})

describe('musicEndBeat', () => {
  it("is the last note's onset plus its written length, not its onset", () => {
    const notes = [note('E0', 0, 1), note('E0', 4, 2)]
    expect(musicEndBeat(notes)).toBe(6)
  })

  it('is the end of the music even when an earlier note is longer', () => {
    const notes = [note('E0', 0, 4), note('E0', 4, 1)]
    expect(musicEndBeat(notes)).toBe(5)
  })

  it('is nothing for an exercise with no notes', () => {
    expect(musicEndBeat([])).toBe(0)
  })
})

describe('countInBeatsOf', () => {
  it.each([
    ['one bar of 4/4', 1, [4, 4] as const, 4],
    ['two bars of 4/4', 2, [4, 4] as const, 8],
    ['one bar of 3/4', 1, [3, 4] as const, 3],
  ])('%s', (_name, countInBars, timeSignature, expected) => {
    expect(countInBeatsOf({ countInBars, timeSignature })).toBe(expected)
  })
})
