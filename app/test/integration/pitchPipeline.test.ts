import { describe, expect, it } from 'vitest'
import { Decimator } from '../../src/audio/dsp/decimator'
import { RingBuffer } from '../../src/audio/dsp/ringBuffer'
import { YinDetector } from '../../src/audio/dsp/yin'
import { DEFAULT_PITCH_PROCESSOR_OPTIONS } from '../../src/audio/worklet/messages'
import { BASS_HARMONICS, centsBetweenFrequencies, noise, tone } from '../support/signals'

/**
 * Exercises the same chain the AudioWorklet assembles - decimate, buffer,
 * detect - at the real interface sample rate. The worklet itself is only
 * plumbing; this is the test that says the plumbing adds up to a working
 * pitch detector.
 */
const INTERFACE_RATE = 48000
const OPTIONS = DEFAULT_PITCH_PROCESSOR_OPTIONS

class Pipeline {
  private readonly decimator = new Decimator(INTERFACE_RATE, OPTIONS.decimation)
  private readonly ring = new RingBuffer(OPTIONS.bufferSize)
  private readonly frame = new Float32Array(OPTIONS.bufferSize)
  private readonly yin: YinDetector

  constructor() {
    this.yin = new YinDetector({
      sampleRate: this.decimator.outputRate,
      bufferSize: OPTIONS.bufferSize,
      minFrequency: OPTIONS.minFrequency,
      maxFrequency: OPTIONS.maxFrequency,
      threshold: OPTIONS.yinThreshold,
    })
  }

  /** Feed a whole signal and return every pitch reading it produced. */
  run(signal: Float32Array): number[] {
    const readings: number[] = []
    let sinceHop = 0
    for (let i = 0; i < signal.length; i++) {
      const decimated = this.decimator.process(signal[i])
      if (decimated === null) continue
      this.ring.push(decimated)
      if (!this.ring.isFull || ++sinceHop < OPTIONS.hopSize) continue
      sinceHop = 0
      this.ring.copyInto(this.frame)
      const result = this.yin.detect(this.frame)
      if (result !== null) readings.push(result.frequency)
    }
    return readings
  }
}

/** Open strings and the two notes the Angel riff is built from. */
const NOTES = [
  { name: 'E1 open E', frequency: 41.2 },
  { name: 'A1 open A', frequency: 55.0 },
  { name: 'C2 Angel root', frequency: 65.41 },
  { name: 'D2 open D', frequency: 73.42 },
  { name: 'Eb2 hymn tonic', frequency: 77.78 },
  { name: 'G2 open G', frequency: 98.0 },
  { name: 'C3', frequency: 130.81 },
]

describe('pitch pipeline at 48 kHz', () => {
  it.each(NOTES)('identifies $name within 10 cents', ({ frequency }) => {
    const signal = tone({
      sampleRate: INTERFACE_RATE,
      frequency,
      length: INTERFACE_RATE,
      harmonics: BASS_HARMONICS,
      decaySeconds: 1.5,
    })
    const readings = new Pipeline().run(signal)
    expect(readings.length).toBeGreaterThan(5)

    const median = readings.slice().sort((a, b) => a - b)[Math.floor(readings.length / 2)]
    expect(Math.abs(centsBetweenFrequencies(median, frequency))).toBeLessThan(10)
  })

  it('stays within a quarter tone of the note for every reading', () => {
    // A single stray reading an octave off would put a wrong note on screen,
    // so the worst case matters more than the average.
    const frequency = 41.2
    const signal = tone({
      sampleRate: INTERFACE_RATE,
      frequency,
      length: INTERFACE_RATE,
      harmonics: BASS_HARMONICS,
      decaySeconds: 2,
    })
    const readings = new Pipeline().run(signal)
    const worst = Math.max(...readings.map((r) => Math.abs(centsBetweenFrequencies(r, frequency))))
    expect(worst).toBeLessThan(50)
  })

  it('tolerates the noise floor of a real interface input', () => {
    const frequency = 98
    const signal = tone({
      sampleRate: INTERFACE_RATE,
      frequency,
      length: INTERFACE_RATE,
      harmonics: BASS_HARMONICS,
      amplitude: 0.4,
    })
    const hiss = noise(signal.length, 0.004)
    for (let i = 0; i < signal.length; i++) signal[i] += hiss[i]

    const readings = new Pipeline().run(signal)
    const median = readings.slice().sort((a, b) => a - b)[Math.floor(readings.length / 2)]
    expect(Math.abs(centsBetweenFrequencies(median, frequency))).toBeLessThan(15)
  })

  it('distinguishes the two notes of the Angel riff', () => {
    // C2 and D2 are a whole tone apart; confusing them would make the riff
    // feedback useless.
    const c2 = new Pipeline().run(
      tone({
        sampleRate: INTERFACE_RATE,
        frequency: 65.41,
        length: INTERFACE_RATE / 2,
        harmonics: BASS_HARMONICS,
      }),
    )
    const d2 = new Pipeline().run(
      tone({
        sampleRate: INTERFACE_RATE,
        frequency: 73.42,
        length: INTERFACE_RATE / 2,
        harmonics: BASS_HARMONICS,
      }),
    )
    expect(Math.max(...c2)).toBeLessThan(Math.min(...d2))
  })
})
