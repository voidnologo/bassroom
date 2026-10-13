import { describe, expect, it } from 'vitest'
import {
  FRET_COUNT,
  STANDARD_TUNING,
  describePosition,
  isPlayable,
  midiAt,
  openStrings,
  positionsFor,
  preferredPosition,
  suggestedFinger,
} from '../../src/music/fretboard'
import { parseNote } from '../../src/music/notes'

describe('openStrings', () => {
  it('describes the four strings of a bass in standard tuning', () => {
    expect(openStrings().map((string) => string.label)).toEqual(['E', 'A', 'D', 'G'])
  })

  it('orders them from lowest pitch upward', () => {
    const midis = openStrings().map((string) => string.midi)
    expect(midis).toEqual([...midis].sort((a, b) => a - b))
  })

  it('reports the tuning frequencies a tuner needs', () => {
    expect(openStrings()[0].frequency).toBeCloseTo(41.2, 1)
  })
})

describe('midiAt', () => {
  it('returns the open pitch at fret zero', () => {
    expect(midiAt({ string: 0, fret: 0 })).toBe(STANDARD_TUNING[0])
  })

  it('finds C2 on the A string at the third fret, as the Angel riff is played', () => {
    expect(midiAt({ string: 1, fret: 3 })).toBe(parseNote('C2'))
  })

  it('finds the same C2 on the E string at the eighth fret', () => {
    expect(midiAt({ string: 0, fret: 8 })).toBe(parseNote('C2'))
  })

  it('finds Eb2, the hymn tonic, on the A string at the sixth fret', () => {
    expect(midiAt({ string: 1, fret: 6 })).toBe(parseNote('Eb2'))
  })
})

describe('isPlayable', () => {
  it('accepts the lowest note on the instrument', () => {
    expect(isPlayable(parseNote('E1'))).toBe(true)
  })

  it('rejects anything below the open E string', () => {
    expect(isPlayable(parseNote('Eb1'))).toBe(false)
  })

  it('rejects anything above the top fret', () => {
    expect(isPlayable(STANDARD_TUNING[3] + FRET_COUNT + 1)).toBe(false)
  })
})

describe('positionsFor', () => {
  it('finds every place a pitch can be played', () => {
    // C2 sits on the E string at 8 and the A string at 3.
    expect(positionsFor(parseNote('C2'))).toEqual([
      { string: 0, fret: 8 },
      { string: 1, fret: 3 },
    ])
  })

  it('returns a single option for the lowest note', () => {
    expect(positionsFor(parseNote('E1'))).toEqual([{ string: 0, fret: 0 }])
  })

  it('returns nothing for an unplayable pitch', () => {
    expect(positionsFor(parseNote('C1'))).toEqual([])
  })

  it('honours a reduced fret range', () => {
    expect(positionsFor(parseNote('C2'), STANDARD_TUNING, 5)).toEqual([{ string: 1, fret: 3 }])
  })
})

describe('preferredPosition', () => {
  it('prefers an open string when one is available', () => {
    expect(preferredPosition(parseNote('D2'))).toEqual({ string: 2, fret: 0 })
  })

  it('prefers the lowest fret when no open string fits', () => {
    expect(preferredPosition(parseNote('C2'))).toEqual({ string: 1, fret: 3 })
  })

  it('stays in the hand position the player is already in', () => {
    // Anchored at the eighth fret, reaching back to fret 3 means a shift; the
    // E string at 8 is under the hand already.
    expect(preferredPosition(parseNote('C2'), { anchorFret: 8, preferOpen: false })).toEqual({
      string: 0,
      fret: 8,
    })
  })

  it('returns null for a pitch the instrument cannot produce', () => {
    expect(preferredPosition(parseNote('C1'))).toBeNull()
  })
})

describe('suggestedFinger', () => {
  it('assigns one finger per fret from the index finger', () => {
    expect(suggestedFinger({ string: 0, fret: 1 }, 1)).toBe(1)
    expect(suggestedFinger({ string: 0, fret: 2 }, 1)).toBe(2)
    expect(suggestedFinger({ string: 0, fret: 3 }, 1)).toBe(3)
    expect(suggestedFinger({ string: 0, fret: 4 }, 1)).toBe(4)
  })

  it('has no finger for an open string', () => {
    expect(suggestedFinger({ string: 0, fret: 0 }, 1)).toBeNull()
  })

  it('has no finger for a note outside the four-fret span', () => {
    expect(suggestedFinger({ string: 0, fret: 6 }, 1)).toBeNull()
    expect(suggestedFinger({ string: 0, fret: 1 }, 3)).toBeNull()
  })
})

describe('describePosition', () => {
  it('names an open string plainly', () => {
    expect(describePosition({ string: 2, fret: 0 })).toBe('open D')
  })

  it('names a fretted note by string and fret', () => {
    expect(describePosition({ string: 1, fret: 3 })).toBe('A string, fret 3')
  })
})
