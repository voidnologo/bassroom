import { describe, expect, it } from 'vitest'
import {
  Biquad,
  FilterChain,
  highpassCoefficients,
  lowpassCoefficients,
} from '../../src/audio/dsp/biquad'
import { tone } from '../support/signals'

const SAMPLE_RATE = 48000

/** Steady-state amplitude after letting the filter settle. */
function amplitudeAfterFilter(
  filter: { process: (x: number) => number },
  frequency: number,
): number {
  const signal = tone({ sampleRate: SAMPLE_RATE, frequency, length: 8192, amplitude: 1 })
  let peak = 0
  for (let i = 0; i < signal.length; i++) {
    const output = filter.process(signal[i])
    // Ignore the first quarter so the transient does not count toward the peak.
    if (i > signal.length / 4) peak = Math.max(peak, Math.abs(output))
  }
  return peak
}

describe('lowpassCoefficients', () => {
  it('produces a normalised, stable set of coefficients', () => {
    const coefficients = lowpassCoefficients(SAMPLE_RATE, 1000, Math.SQRT1_2)
    expect(Number.isFinite(coefficients.b0)).toBe(true)
    // Stability: both poles inside the unit circle means |a2| < 1.
    expect(Math.abs(coefficients.a2)).toBeLessThan(1)
  })
})

describe('Biquad lowpass', () => {
  it('passes frequencies well below the cutoff almost untouched', () => {
    const filter = new Biquad(lowpassCoefficients(SAMPLE_RATE, 2000, Math.SQRT1_2))
    expect(amplitudeAfterFilter(filter, 100)).toBeGreaterThan(0.95)
  })

  it('is about 3 dB down at the cutoff', () => {
    const filter = new Biquad(lowpassCoefficients(SAMPLE_RATE, 2000, Math.SQRT1_2))
    const amplitude = amplitudeAfterFilter(filter, 2000)
    expect(amplitude).toBeGreaterThan(0.6)
    expect(amplitude).toBeLessThan(0.78)
  })

  it('attenuates well above the cutoff', () => {
    const filter = new Biquad(lowpassCoefficients(SAMPLE_RATE, 2000, Math.SQRT1_2))
    expect(amplitudeAfterFilter(filter, 12000)).toBeLessThan(0.05)
  })

  it('returns to its initial state after reset', () => {
    const filter = new Biquad(lowpassCoefficients(SAMPLE_RATE, 2000, Math.SQRT1_2))
    const first = filter.process(1)
    filter.process(1)
    filter.reset()
    expect(filter.process(1)).toBeCloseTo(first, 10)
  })
})

describe('Biquad highpass', () => {
  it('rejects the low rumble that a bass cabinet puts into a room', () => {
    const filter = new Biquad(highpassCoefficients(SAMPLE_RATE, 30, Math.SQRT1_2))
    expect(amplitudeAfterFilter(filter, 5)).toBeLessThan(0.1)
  })

  it('passes the open E string', () => {
    const filter = new Biquad(highpassCoefficients(SAMPLE_RATE, 20, Math.SQRT1_2))
    expect(amplitudeAfterFilter(filter, 41.2)).toBeGreaterThan(0.85)
  })
})

describe('FilterChain', () => {
  it('rolls off faster than a single section', () => {
    const single = new Biquad(lowpassCoefficients(SAMPLE_RATE, 2000, Math.SQRT1_2))
    const cascade = FilterChain.butterworthLowpass(SAMPLE_RATE, 2000, 4)
    expect(amplitudeAfterFilter(cascade, 8000)).toBeLessThan(amplitudeAfterFilter(single, 8000))
  })

  it('still passes the band of interest', () => {
    const cascade = FilterChain.butterworthLowpass(SAMPLE_RATE, 2000, 4)
    expect(amplitudeAfterFilter(cascade, 200)).toBeGreaterThan(0.95)
  })

  it('rejects an order it has no Q table for', () => {
    expect(() => FilterChain.butterworthLowpass(SAMPLE_RATE, 2000, 3)).toThrow(/Unsupported/)
  })

  it('resets every stage', () => {
    const cascade = FilterChain.butterworthLowpass(SAMPLE_RATE, 2000, 4)
    const first = cascade.process(1)
    cascade.process(1)
    cascade.reset()
    expect(cascade.process(1)).toBeCloseTo(first, 10)
  })
})
