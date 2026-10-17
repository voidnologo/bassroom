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

/**
 * An open string plucked repeatedly at one strength.
 *
 * A bass string is still at roughly 70% of its previous peak an eighth note
 * later at practice tempo, and its harmonics decay faster than its
 * fundamental. Both are what separates an attack from a sustain, so both are
 * synthesised rather than approximated with a single decaying sine.
 */
function evenPluckTrain(options: {
  frequency: number
  count: number
  gapSeconds: number
  amplitude?: number
  fundamentalDecaySeconds?: number
}): Float32Array {
  const { frequency, count, gapSeconds, amplitude = 0.03 } = options
  const fundamentalDecaySeconds = options.fundamentalDecaySeconds ?? 2
  const length = Math.round((gapSeconds * count + 1) * SAMPLE_RATE)
  const out = new Float32Array(length)
  for (let n = 0; n < count; n++) {
    const start = Math.round(n * gapSeconds * SAMPLE_RATE)
    addPluck(out, start, { frequency, amplitude, fundamentalDecaySeconds })
  }
  return out
}

function addPluck(
  out: Float32Array,
  start: number,
  spec: { frequency: number; amplitude: number; fundamentalDecaySeconds: number },
): void {
  const { frequency, amplitude, fundamentalDecaySeconds } = spec
  for (let harmonic = 1; harmonic <= PLUCK_HARMONICS; harmonic++) {
    const decay = fundamentalDecaySeconds / harmonic
    for (let i = start; i < out.length; i++) {
      const seconds = (i - start) / SAMPLE_RATE
      const envelope = Math.exp(-seconds / decay)
      if (envelope < 1e-4) break
      out[i] +=
        (amplitude / harmonic) * envelope * Math.sin(2 * Math.PI * frequency * harmonic * seconds)
    }
  }
}

/** Enough partials to carry a pluck transient; past this they are inaudible. */
const PLUCK_HARMONICS = 12

/** Eighth notes at 44 bpm, the tempo the misses were reported at. */
const EIGHTH_AT_44_BPM = 60 / 44 / 2

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
    //
    // The second note runs to the end of the buffer rather than stopping part
    // way: cutting a tone mid-cycle is a step, and a step is an attack.
    const ringing = pluck(65.41, 1.0, 0.5)
    const second = pluck(73.42, 0.6, 0.5)
    const signal = concat(silence(2400), ringing)
    const entryOffset = 2400 + Math.round(SAMPLE_RATE * 0.4)
    for (let i = 0; i < second.length; i++) signal[entryOffset + i] += second[i]
    expect(run(detector(), signal)).toHaveLength(2)
  })

  it.each([
    ['open E', 41.2],
    ['open A', 55],
    ['open D', 73.4],
    ['open G', 98],
  ])('finds every pluck of a repeated %s played at an even strength', (_name, frequency) => {
    const signal = evenPluckTrain({ frequency, count: 8, gapSeconds: EIGHTH_AT_44_BPM })
    expect(run(detector(), signal)).toHaveLength(8)
  })

  it('does not fire on the noise floor when a take starts from silence', () => {
    const onsets = run(detector(), concat(silence(4800), pluck(55, 1, 0.03)))
    const floorAmplitude = 10 ** (DEFAULT_ONSET_OPTIONS.floorDb / 20)
    expect(onsets[0].level).toBeGreaterThan(floorAmplitude * 4)
  })

  it('finds nothing in a string left to ring on its own', () => {
    const signal = evenPluckTrain({ frequency: 55, count: 1, gapSeconds: 3 })
    expect(run(detector(), signal)).toHaveLength(1)
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
