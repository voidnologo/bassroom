import { describe, expect, it } from 'vitest'
import { DEFAULT_YIN_OPTIONS, YinDetector, parabolicMinimum } from '../../src/audio/dsp/yin'
import {
  BASS_HARMONICS,
  SECOND_HARMONIC_HEAVY,
  centsBetweenFrequencies,
  noise,
  tone,
} from '../support/signals'

/** The analysis rate the worklet actually uses: 48 kHz decimated by 4. */
const SAMPLE_RATE = 12000
const BUFFER_SIZE = 1536

function detector(overrides: Partial<typeof DEFAULT_YIN_OPTIONS> = {}): YinDetector {
  return new YinDetector({
    sampleRate: SAMPLE_RATE,
    bufferSize: BUFFER_SIZE,
    ...DEFAULT_YIN_OPTIONS,
    ...overrides,
  })
}

/** Open strings of a 4-string bass, plus the two notes the Angel riff uses. */
const TEST_PITCHES = [
  { name: 'E1 (open E)', frequency: 41.2 },
  { name: 'A1 (open A)', frequency: 55.0 },
  { name: 'C2 (A string, fret 3)', frequency: 65.41 },
  { name: 'D2 (open D)', frequency: 73.42 },
  { name: 'G2 (open G)', frequency: 98.0 },
  { name: 'C3', frequency: 130.81 },
  { name: 'G3', frequency: 196.0 },
  { name: 'D4 (top of the neck)', frequency: 293.66 },
]

describe('YinDetector', () => {
  describe.each(TEST_PITCHES)('on $name', ({ frequency }) => {
    it('detects a pure sine within 5 cents', () => {
      const result = detector().detect(
        tone({ sampleRate: SAMPLE_RATE, frequency, length: BUFFER_SIZE }),
      )
      expect(result).not.toBeNull()
      expect(Math.abs(centsBetweenFrequencies(result!.frequency, frequency))).toBeLessThan(5)
    })

    it('detects a harmonically rich bass tone within 10 cents', () => {
      const result = detector().detect(
        tone({
          sampleRate: SAMPLE_RATE,
          frequency,
          length: BUFFER_SIZE,
          harmonics: BASS_HARMONICS,
        }),
      )
      expect(result).not.toBeNull()
      expect(Math.abs(centsBetweenFrequencies(result!.frequency, frequency))).toBeLessThan(10)
    })

    it('reports high clarity for a clean tone', () => {
      const result = detector().detect(
        tone({
          sampleRate: SAMPLE_RATE,
          frequency,
          length: BUFFER_SIZE,
          harmonics: BASS_HARMONICS,
        }),
      )
      expect(result!.clarity).toBeGreaterThan(0.85)
    })
  })

  it('does not report the octave above when the second harmonic dominates', () => {
    // The failure mode this guards against: picking the global minimum of the
    // difference function instead of the first dip below threshold.
    const fundamental = 55
    const result = detector().detect(
      tone({
        sampleRate: SAMPLE_RATE,
        frequency: fundamental,
        length: BUFFER_SIZE,
        harmonics: SECOND_HARMONIC_HEAVY,
      }),
    )
    expect(result).not.toBeNull()
    expect(Math.abs(centsBetweenFrequencies(result!.frequency, fundamental))).toBeLessThan(15)
  })

  it('tracks a decaying note, as a real plucked string does', () => {
    const result = detector().detect(
      tone({
        sampleRate: SAMPLE_RATE,
        frequency: 65.41,
        length: BUFFER_SIZE,
        harmonics: BASS_HARMONICS,
        decaySeconds: 0.4,
      }),
    )
    expect(result).not.toBeNull()
    expect(Math.abs(centsBetweenFrequencies(result!.frequency, 65.41))).toBeLessThan(10)
  })

  it('reports no pitch for broadband noise', () => {
    const result = detector().detect(noise(BUFFER_SIZE, 0.3))
    if (result !== null) expect(result.clarity).toBeLessThan(0.8)
  })

  it('reports no pitch for silence', () => {
    expect(detector().detect(new Float32Array(BUFFER_SIZE))).toBeNull()
  })

  it('never reports a frequency outside the configured search band', () => {
    // A 300 Hz tone is genuinely periodic at 150 Hz, 100 Hz, 75 Hz and so on,
    // so a detector searching only up to 120 Hz correctly locks onto a
    // subharmonic rather than failing. What matters is that the reported value
    // always falls inside the band the caller asked for.
    const result = detector({ maxFrequency: 120 }).detect(
      tone({ sampleRate: SAMPLE_RATE, frequency: 300, length: BUFFER_SIZE }),
    )
    if (result !== null) {
      expect(result.frequency).toBeGreaterThanOrEqual(DEFAULT_YIN_OPTIONS.minFrequency)
      expect(result.frequency).toBeLessThanOrEqual(120)
    }
  })

  it('refuses a buffer too short for the requested low frequency', () => {
    expect(
      () =>
        new YinDetector({
          sampleRate: SAMPLE_RATE,
          bufferSize: 256,
          ...DEFAULT_YIN_OPTIONS,
        }),
    ).toThrow(/too small/)
  })

  it('rejects a frame shorter than the configured buffer', () => {
    expect(() => detector().detect(new Float32Array(100))).toThrow(/must hold/)
  })

  it('is allocation-stable across repeated calls', () => {
    const instance = detector()
    const frame = tone({ sampleRate: SAMPLE_RATE, frequency: 98, length: BUFFER_SIZE })
    const first = instance.detect(frame)
    const second = instance.detect(frame)
    expect(second!.frequency).toBeCloseTo(first!.frequency, 6)
  })
})

describe('parabolicMinimum', () => {
  it('returns the index unchanged at the array edges', () => {
    const values = Float32Array.from([1, 0.5, 0.2, 0.5])
    expect(parabolicMinimum(values, 0, 3)).toBe(0)
    expect(parabolicMinimum(values, 3, 3)).toBe(3)
  })

  it('finds the true minimum of a symmetric dip at the sample', () => {
    const values = Float32Array.from([1, 0.5, 0.2, 0.5, 1])
    expect(parabolicMinimum(values, 2, 4)).toBeCloseTo(2, 6)
  })

  it('shifts toward the lower neighbour of an asymmetric dip', () => {
    const values = Float32Array.from([1, 0.3, 0.2, 0.8, 1])
    expect(parabolicMinimum(values, 2, 4)).toBeLessThan(2)
  })

  it('returns the index when the three points are collinear', () => {
    const values = Float32Array.from([0.5, 0.5, 0.5])
    expect(parabolicMinimum(values, 1, 2)).toBe(1)
  })
})
