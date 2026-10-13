import { describe, expect, it } from 'vitest'
import { Biquad, FilterChain, lowpassCoefficients } from '../../src/audio/dsp/biquad'
import { Decimator } from '../../src/audio/dsp/decimator'
import { DEFAULT_ONSET_OPTIONS, OnsetDetector } from '../../src/audio/dsp/onset'
import { RingBuffer } from '../../src/audio/dsp/ringBuffer'
import { DEFAULT_YIN_OPTIONS, YinDetector } from '../../src/audio/dsp/yin'

const SAMPLE_RATE = 48_000
const ANALYSIS_RATE = 12_000

/**
 * AU3 names every DSP class, so this list is the thing that has to stay
 * complete. A class added to src/audio/dsp/ without a row here is the gap the
 * rule was written to close.
 */
const DSP_CLASSES: Array<[string, () => { reset: () => void }]> = [
  ['Biquad', () => new Biquad(lowpassCoefficients(SAMPLE_RATE, 2000, Math.SQRT1_2))],
  ['FilterChain', () => FilterChain.butterworthLowpass(SAMPLE_RATE, 2000, 4)],
  ['Decimator', () => new Decimator(SAMPLE_RATE, 4)],
  ['RingBuffer', () => new RingBuffer(1536)],
  [
    'OnsetDetector',
    () => new OnsetDetector({ sampleRate: ANALYSIS_RATE, ...DEFAULT_ONSET_OPTIONS }),
  ],
  [
    'YinDetector',
    () => new YinDetector({ sampleRate: ANALYSIS_RATE, bufferSize: 1536, ...DEFAULT_YIN_OPTIONS }),
  ],
]

describe('the DSP reset contract', () => {
  it.each(DSP_CLASSES)('%s exposes a reset', (_name, make) => {
    expect(typeof make().reset).toBe('function')
  })

  it.each(DSP_CLASSES)('%s can be reset before it has processed anything', (_name, make) => {
    expect(() => make().reset()).not.toThrow()
  })

  it('covers every class exported from src/audio/dsp', async () => {
    const modules = await Promise.all([
      import('../../src/audio/dsp/biquad'),
      import('../../src/audio/dsp/decimator'),
      import('../../src/audio/dsp/onset'),
      import('../../src/audio/dsp/ringBuffer'),
      import('../../src/audio/dsp/yin'),
    ])
    const exported = modules
      .flatMap((module) => Object.entries(module))
      .filter(([, value]) => typeof value === 'function' && /^class\s/.test(value.toString()))
      .map(([name]) => name)
    expect(new Set(exported)).toEqual(new Set(DSP_CLASSES.map(([name]) => name)))
  })
})
