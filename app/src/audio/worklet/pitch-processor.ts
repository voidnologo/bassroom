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

    this.onsets.process(channel, currentTime, (onset) => {
      this.port.postMessage({ type: 'onset', time: onset.time, level: onset.level })
    })

    this.accumulate(channel)
    if (this.shouldAnalyze()) this.analyze()
    return true
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
