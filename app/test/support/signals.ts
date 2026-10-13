/** Synthetic signal generators shared by the DSP tests. */

export interface ToneOptions {
  sampleRate: number
  frequency: number
  length: number
  /** Relative amplitudes of harmonics 1..n. [1] is a pure sine. */
  harmonics?: number[]
  amplitude?: number
  /** Exponential decay time constant in seconds; omit for a steady tone. */
  decaySeconds?: number
  phase?: number
}

/**
 * A plucked string is nothing like a sine wave, so the detector is tested
 * against harmonically rich tones: a strong second or third harmonic is the
 * condition under which a naive autocorrelation reports the wrong octave.
 */
export function tone(options: ToneOptions): Float32Array {
  const {
    sampleRate,
    frequency,
    length,
    harmonics = [1],
    amplitude = 0.5,
    decaySeconds,
    phase = 0,
  } = options

  const output = new Float32Array(length)
  const normalizer = harmonics.reduce((sum, value) => sum + Math.abs(value), 0) || 1

  for (let i = 0; i < length; i++) {
    const seconds = i / sampleRate
    let sample = 0
    harmonics.forEach((level, index) => {
      const partial = index + 1
      sample += level * Math.sin(2 * Math.PI * frequency * partial * seconds + phase * partial)
    })
    const envelope = decaySeconds === undefined ? 1 : Math.exp(-seconds / decaySeconds)
    output[i] = (amplitude * sample * envelope) / normalizer
  }
  return output
}

/** Amplitude spectrum of an electric bass note: strong fundamental, decaying partials. */
export const BASS_HARMONICS = [1, 0.7, 0.45, 0.3, 0.2, 0.12, 0.08, 0.05]

/** Harmonics tuned to trip octave errors: the second partial dominates. */
export const SECOND_HARMONIC_HEAVY = [0.4, 1, 0.5, 0.25]

export function noise(length: number, amplitude = 0.05, seed = 1): Float32Array {
  const output = new Float32Array(length)
  let state = seed
  for (let i = 0; i < length; i++) {
    // Deterministic LCG: tests must not be flaky because of Math.random.
    state = (state * 1664525 + 1013904223) % 4294967296
    output[i] = ((state / 4294967296) * 2 - 1) * amplitude
  }
  return output
}

export function mix(...signals: Float32Array[]): Float32Array {
  const length = Math.max(...signals.map((signal) => signal.length))
  const output = new Float32Array(length)
  for (const signal of signals) {
    for (let i = 0; i < signal.length; i++) output[i] += signal[i]
  }
  return output
}

export function silence(length: number): Float32Array {
  return new Float32Array(length)
}

export function concat(...signals: Float32Array[]): Float32Array {
  const total = signals.reduce((sum, signal) => sum + signal.length, 0)
  const output = new Float32Array(total)
  let offset = 0
  for (const signal of signals) {
    output.set(signal, offset)
    offset += signal.length
  }
  return output
}

export function centsBetweenFrequencies(a: number, b: number): number {
  return 1200 * Math.log2(a / b)
}
