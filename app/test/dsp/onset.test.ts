import { describe, expect, it } from 'vitest'
import { DEFAULT_ONSET_OPTIONS, OnsetDetector, type DetectedOnset } from '../../src/audio/dsp/onset'
import { concat, silence, tone } from '../support/signals'

const SAMPLE_RATE = 48000

function detector(overrides: Partial<typeof DEFAULT_ONSET_OPTIONS> = {}): OnsetDetector {
  return new OnsetDetector({ sampleRate: SAMPLE_RATE, ...DEFAULT_ONSET_OPTIONS, ...overrides })
}

/** One plucked note: instant attack, exponential decay, like a real string. */
function pluck(frequency: number, seconds: number, amplitude = 0.6): Float32Array {
  return tone({
    sampleRate: SAMPLE_RATE,
    frequency,
    length: Math.round(SAMPLE_RATE * seconds),
    amplitude,
    decaySeconds: 0.5,
  })
}

/** Feed a signal in 128-sample quanta, the way the audio thread delivers it. */
function run(instance: OnsetDetector, signal: Float32Array): DetectedOnset[] {
  const found: DetectedOnset[] = []
  const quantum = 128
  for (let offset = 0; offset < signal.length; offset += quantum) {
    const block = signal.subarray(offset, Math.min(offset + quantum, signal.length))
    instance.process(block, offset / SAMPLE_RATE, (onset) => found.push(onset))
  }
  return found
}

describe('OnsetDetector', () => {
  it('finds nothing in silence', () => {
    expect(run(detector(), silence(SAMPLE_RATE))).toHaveLength(0)
  })

  it('finds a single attack after silence', () => {
    const onsets = run(detector(), concat(silence(4800), pluck(65.41, 1)))
    expect(onsets).toHaveLength(1)
  })

  it('times the attack to within 10 ms', () => {
    const onsets = run(detector(), concat(silence(4800), pluck(65.41, 1)))
    expect(onsets[0].time).toBeGreaterThanOrEqual(0.1)
    expect(onsets[0].time).toBeLessThan(0.11)
  })

  it('counts four separate plucks as four onsets', () => {
    const signal = concat(
      silence(2400),
      pluck(65.41, 0.5),
      pluck(73.42, 0.5),
      pluck(65.41, 0.5),
      pluck(73.42, 0.5),
    )
    expect(run(detector(), signal)).toHaveLength(4)
  })

  it('finds a re-pluck while the previous note is still ringing', () => {
    // The ratio test exists for exactly this: an attack layered on a sounding
    // note, which an absolute threshold would miss entirely.
    const ringing = pluck(65.41, 1.0, 0.5)
    const second = pluck(73.42, 0.5, 0.5)
    const signal = concat(silence(2400), ringing)
    const entryOffset = 2400 + Math.round(SAMPLE_RATE * 0.4)
    for (let i = 0; i < second.length; i++) signal[entryOffset + i] += second[i]
    expect(run(detector(), signal)).toHaveLength(2)
  })

  it('ignores signal below the absolute floor', () => {
    const hum = tone({
      sampleRate: SAMPLE_RATE,
      frequency: 60,
      length: SAMPLE_RATE,
      amplitude: 0.0005,
    })
    expect(run(detector(), concat(silence(2400), hum))).toHaveLength(0)
  })

  it('does not double-trigger within the refractory period', () => {
    const onsets = run(
      detector({ refractoryMs: 200 }),
      concat(silence(2400), pluck(65.41, 0.05), pluck(65.41, 0.5)),
    )
    expect(onsets).toHaveLength(1)
  })

  it('reports the peak of the attack, not the level at the moment it fired', () => {
    // The fast envelope needs a few milliseconds to reach the peak of a pluck,
    // so the level at the threshold crossing is well below how hard it was hit.
    const onsets = run(detector(), concat(silence(2400), pluck(65.41, 0.5, 0.6)))
    expect(onsets[0].level).toBeGreaterThan(0.2)
  })

  it('does not report the noise gate as the level of the first note', () => {
    const floorAmplitude = 10 ** (DEFAULT_ONSET_OPTIONS.floorDb / 20)
    const onsets = run(detector(), concat(silence(4800), pluck(55, 1, 0.03)))
    expect(onsets[0].level).toBeGreaterThan(floorAmplitude * 4)
  })

  it('reports a level that reflects how hard the string was hit', () => {
    const soft = run(detector(), concat(silence(2400), pluck(65.41, 0.5, 0.15)))
    const hard = run(detector(), concat(silence(2400), pluck(65.41, 0.5, 0.8)))
    expect(hard[0].level).toBeGreaterThan(soft[0].level)
  })

  it('finds an attack again after reset', () => {
    const instance = detector()
    run(instance, concat(silence(2400), pluck(65.41, 0.5)))
    instance.reset()
    expect(run(instance, concat(silence(2400), pluck(65.41, 0.5)))).toHaveLength(1)
  })
})

describe('the rise ratio an onset reports', () => {
  it('clears the threshold the detector was configured with', () => {
    const onsets = run(detector(), concat(silence(2400), pluck(65.41, 0.5)))
    expect(onsets[0].riseRatio).toBeGreaterThanOrEqual(DEFAULT_ONSET_OPTIONS.riseRatio)
  })

  it('is larger for a hard pluck than a soft one, so the margin is readable', () => {
    const soft = run(detector(), concat(silence(2400), pluck(65.41, 0.5, 0.15)))
    const hard = run(detector(), concat(silence(2400), pluck(65.41, 0.5, 0.8)))
    expect(hard[0].riseRatio).toBeGreaterThan(soft[0].riseRatio)
  })
})
