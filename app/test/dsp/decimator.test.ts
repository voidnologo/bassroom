import { describe, expect, it } from 'vitest'
import { Decimator } from '../../src/audio/dsp/decimator'
import { tone } from '../support/signals'

const SAMPLE_RATE = 48000

function decimate(decimator: Decimator, signal: Float32Array): number[] {
  const output: number[] = []
  for (let i = 0; i < signal.length; i++) {
    const sample = decimator.process(signal[i])
    if (sample !== null) output.push(sample)
  }
  return output
}

describe('Decimator', () => {
  it('reports the reduced output rate', () => {
    expect(new Decimator(SAMPLE_RATE, 4).outputRate).toBe(12000)
  })

  it('emits one sample per factor input samples', () => {
    const decimator = new Decimator(SAMPLE_RATE, 4)
    const output = decimate(decimator, new Float32Array(4000))
    expect(output).toHaveLength(1000)
  })

  it('preserves a bass-range tone through decimation', () => {
    const decimator = new Decimator(SAMPLE_RATE, 4)
    const signal = tone({ sampleRate: SAMPLE_RATE, frequency: 98, length: 24000, amplitude: 1 })
    const output = decimate(decimator, signal)
    const peak = Math.max(...output.slice(1000).map(Math.abs))
    expect(peak).toBeGreaterThan(0.9)
  })

  it('suppresses content above the new Nyquist so it cannot alias', () => {
    const decimator = new Decimator(SAMPLE_RATE, 4)
    // 9 kHz would fold back to 3 kHz at a 12 kHz rate without the filter.
    const signal = tone({ sampleRate: SAMPLE_RATE, frequency: 9000, length: 24000, amplitude: 1 })
    const output = decimate(decimator, signal)
    const peak = Math.max(...output.slice(1000).map(Math.abs))
    expect(peak).toBeLessThan(0.02)
  })

  it('passes samples through unchanged at a factor of one', () => {
    const decimator = new Decimator(SAMPLE_RATE, 1)
    expect(decimate(decimator, new Float32Array(10))).toHaveLength(10)
  })

  it('rejects a non-integer factor', () => {
    expect(() => new Decimator(SAMPLE_RATE, 2.5)).toThrow(/positive integer/)
  })

  it('rejects a factor below one', () => {
    expect(() => new Decimator(SAMPLE_RATE, 0)).toThrow(/positive integer/)
  })

  it('restarts its phase after reset', () => {
    const decimator = new Decimator(SAMPLE_RATE, 4)
    decimator.process(1)
    decimator.reset()
    expect(decimator.process(1)).toBeNull()
  })
})
