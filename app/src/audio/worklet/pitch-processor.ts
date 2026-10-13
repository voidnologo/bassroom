import { FilterChain } from '../dsp/biquad'
import { Decimator } from '../dsp/decimator'
import { DEFAULT_ONSET_OPTIONS, OnsetDetector } from '../dsp/onset'
import { RingBuffer } from '../dsp/ringBuffer'
import { YinDetector } from '../dsp/yin'
import {
  DEFAULT_PITCH_PROCESSOR_OPTIONS,
  PITCH_PROCESSOR_NAME,
  type PitchProcessorOptions,
  type WorkletCommand,
} from './messages'

/**
 * The render quantum is 128 samples today and the spec reserves the right to
 * change it, so the scratch buffer is sized with room to spare.
 */
const MAX_RENDER_QUANTUM = 1024

/**
 * Wires the DSP blocks together on the audio thread.
 *
 * This file is deliberately thin: every algorithm lives in `../dsp`, where it
 * is covered by unit tests that run in plain Node. What is left here is only
 * the plumbing that needs a real AudioWorkletGlobalScope.
 *
 * Built to public/pitch-processor.js by vite.worklet.config.ts.
 */
class PitchProcessor extends AudioWorkletProcessor {
  private readonly options: PitchProcessorOptions
  private readonly dcBlocker: FilterChain
  private readonly blocked: Float32Array
  private readonly decimator: Decimator
  private readonly ring: RingBuffer
  private readonly frame: Float32Array
  private readonly yin: YinDetector
  private readonly onsets: OnsetDetector
  private readonly silenceFloor: number

  private samplesSinceHop = 0
  private running = true

  constructor(options?: { processorOptions?: Record<string, unknown> }) {
    super()
    this.options = { ...DEFAULT_PITCH_PROCESSOR_OPTIONS, ...(options?.processorOptions ?? {}) }

    // 20 Hz is an octave below the open E string, so this removes any offset
    // without touching the lowest note the instrument can produce.
    this.dcBlocker = FilterChain.butterworthHighpass(sampleRate, 20, 2)
    this.blocked = new Float32Array(MAX_RENDER_QUANTUM)
    this.decimator = new Decimator(sampleRate, this.options.decimation)
    this.ring = new RingBuffer(this.options.bufferSize)
    this.frame = new Float32Array(this.options.bufferSize)
    this.yin = new YinDetector({
      sampleRate: this.decimator.outputRate,
      bufferSize: this.options.bufferSize,
      minFrequency: this.options.minFrequency,
      maxFrequency: this.options.maxFrequency,
      threshold: this.options.yinThreshold,
    })
    this.onsets = new OnsetDetector({
      ...DEFAULT_ONSET_OPTIONS,
      sampleRate,
      riseRatio: this.options.onsetRiseRatio,
      floorDb: this.options.onsetFloorDb,
      refractoryMs: this.options.onsetRefractoryMs,
    })

    // Half the onset gate: quiet enough to skip analysis on silence, low
    // enough that a note decaying into its tail still tracks.
    this.silenceFloor = 10 ** (this.options.onsetFloorDb / 20) * 0.5

    this.port.onmessage = (event: MessageEvent<WorkletCommand>) => {
      if (event.data?.type === 'stop') this.running = false
    }
  }

  process(inputs: Float32Array[][]): boolean {
    if (!this.running) return false
    const channel = inputs[0]?.[0]
    if (!channel) return true

    const clean = this.removeOffset(channel)
    this.onsets.process(clean, currentTime, (onset) => {
      this.port.postMessage({ type: 'onset', time: onset.time, level: onset.level })
    })

    this.accumulate(clean)
    if (this.shouldAnalyze()) this.analyze()
    return true
  }

  /**
   * Writes into a preallocated buffer and returns a view of it. The audio
   * thread must not allocate, so the buffer is sized for the largest quantum a
   * browser could hand over rather than for the one it usually does.
   */
  private removeOffset(channel: Float32Array): Float32Array {
    const length = Math.min(channel.length, this.blocked.length)
    for (let i = 0; i < length; i++) this.blocked[i] = this.dcBlocker.process(channel[i])
    return this.blocked.subarray(0, length)
  }

  private accumulate(channel: Float32Array): void {
    for (let i = 0; i < channel.length; i++) {
      const decimated = this.decimator.process(channel[i])
      if (decimated === null) continue
      this.ring.push(decimated)
      this.samplesSinceHop++
    }
  }

  private shouldAnalyze(): boolean {
    return this.ring.isFull && this.samplesSinceHop >= this.options.hopSize
  }

  private analyze(): void {
    this.samplesSinceHop = 0
    this.ring.copyInto(this.frame)

    const rms = rootMeanSquare(this.frame)
    const result = rms > this.silenceFloor ? this.yin.detect(this.frame) : null

    this.port.postMessage({
      type: 'pitch',
      time: currentTime,
      rms,
      frequency: result?.frequency ?? 0,
      clarity: result?.clarity ?? 0,
    })
  }
}

function rootMeanSquare(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

registerProcessor(PITCH_PROCESSOR_NAME, PitchProcessor)
