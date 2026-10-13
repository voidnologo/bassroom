import { describe, expect, it } from 'vitest'
import {
  centsBetween,
  centsFromNearestNote,
  frequencyToMidi,
  intervalName,
  midiToFrequency,
  noteName,
  octaveOf,
  parseNote,
  pitchClassName,
} from '../../src/music/notes'

describe('midiToFrequency', () => {
  it('places concert A at 440 Hz', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6)
  })

  it.each([
    { name: 'open E', midi: 28, frequency: 41.203 },
    { name: 'open A', midi: 33, frequency: 55.0 },
    { name: 'open D', midi: 38, frequency: 73.416 },
    { name: 'open G', midi: 43, frequency: 97.999 },
  ])('puts $name at $frequency Hz', ({ midi, frequency }) => {
    expect(midiToFrequency(midi)).toBeCloseTo(frequency, 2)
  })

  it('doubles frequency across an octave', () => {
    expect(midiToFrequency(40) / midiToFrequency(28)).toBeCloseTo(2, 6)
  })
})

describe('frequencyToMidi', () => {
  it('inverts midiToFrequency', () => {
    for (const midi of [28, 33, 40, 55, 69, 84]) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 6)
    }
  })
})

describe('centsFromNearestNote', () => {
  it('reports zero cents for an exactly tuned note', () => {
    const { midi, cents } = centsFromNearestNote(midiToFrequency(33))
    expect(midi).toBe(33)
    expect(cents).toBeCloseTo(0, 6)
  })

  it('reports a positive offset for a sharp string', () => {
    const { midi, cents } = centsFromNearestNote(midiToFrequency(33) * 2 ** (20 / 1200))
    expect(midi).toBe(33)
    expect(cents).toBeCloseTo(20, 1)
  })

  it('reports a negative offset for a flat string', () => {
    const { cents } = centsFromNearestNote(midiToFrequency(28) * 2 ** (-30 / 1200))
    expect(cents).toBeCloseTo(-30, 1)
  })

  it('rolls over to the next note past the halfway point', () => {
    const { midi } = centsFromNearestNote(midiToFrequency(28) * 2 ** (60 / 1200))
    expect(midi).toBe(29)
  })
})

describe('centsBetween', () => {
  it('measures a semitone as 100 cents', () => {
    expect(centsBetween(midiToFrequency(29), 28)).toBeCloseTo(100, 4)
  })

  it('is signed', () => {
    expect(centsBetween(midiToFrequency(27), 28)).toBeCloseTo(-100, 4)
  })
})

describe('pitchClassName', () => {
  it('uses flats by default, which is how the hymn is written', () => {
    expect(pitchClassName(39)).toBe('Eb')
  })

  it('uses sharps on request', () => {
    expect(pitchClassName(39, 'sharp')).toBe('D#')
  })

  it('handles every pitch class without gaps', () => {
    const names = new Set(Array.from({ length: 12 }, (_, i) => pitchClassName(i)))
    expect(names.size).toBe(12)
  })
})

describe('noteName and octaveOf', () => {
  it.each([
    { midi: 28, name: 'E1' },
    { midi: 33, name: 'A1' },
    { midi: 36, name: 'C2' },
    { midi: 38, name: 'D2' },
    { midi: 39, name: 'Eb2' },
    { midi: 60, name: 'C4' },
  ])('names MIDI $midi as $name', ({ midi, name }) => {
    expect(noteName(midi)).toBe(name)
  })

  it('puts middle C in octave 4', () => {
    expect(octaveOf(60)).toBe(4)
  })
})

describe('parseNote', () => {
  it.each(['E1', 'A1', 'C2', 'D2', 'Eb2', 'F#1', 'Bb1', 'C4'])('round-trips %s', (name) => {
    expect(noteName(parseNote(name), name.includes('#') ? 'sharp' : 'flat')).toBe(name)
  })

  it('accepts double flats', () => {
    expect(parseNote('Cbb4')).toBe(parseNote('C4') - 2)
  })

  it('treats enharmonics as the same pitch', () => {
    expect(parseNote('F#1')).toBe(parseNote('Gb1'))
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseNote('  C2 ')).toBe(36)
  })

  it('rejects something that is not a pitch name', () => {
    expect(() => parseNote('H2')).toThrow(/Not a pitch name/)
  })

  it('rejects a pitch name with no octave', () => {
    expect(() => parseNote('C')).toThrow(/Not a pitch name/)
  })
})

describe('intervalName', () => {
  it.each([
    { semitones: 0, name: 'unison' },
    { semitones: 2, name: 'major 2nd' },
    { semitones: 7, name: 'perfect 5th' },
    { semitones: 12, name: 'octave' },
  ])('names $semitones semitones', ({ semitones, name }) => {
    expect(intervalName(semitones)).toBe(name)
  })

  it('ignores direction', () => {
    expect(intervalName(-7)).toBe(intervalName(7))
  })

  it('describes compound intervals', () => {
    expect(intervalName(19)).toContain('octave')
  })
})
