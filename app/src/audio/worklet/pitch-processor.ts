import { FilterChain } from '../dsp/biquad'
import { Decimator } from '../dsp/decimator'
import { DEFAULT_ONSET_OPTIONS, OnsetDetector, type DetectedOnset } from '../dsp/onset'
import { RingBuffer } from '../dsp/ringBuffer'
import { YinDetector } from '../dsp/yin'
import {
  DEFAULT_PITCH_PROCESSOR_OPTIONS,
  PITCH_PROCESSOR_NAME,
  resolveProcessorLayout,
  type PitchProcessorOptions,
  type WorkletCommand,
} from './messages'

/**
 * Wires the DSP blocks together on the audio thread.
 *
 * Deliberately thin: every algorithm lives in `../dsp`, where it is covered by
 * unit tests that run in plain Node. What is left here is only the plumbing
 * that needs a real AudioWorkletGlobalScope.
 *
 * Built to public/pitch-processor.js by vite.worklet.config.ts.
 */

/**
 * The render quantum is 128 samples today and the spec reserves the right to
 * change it, so the scratch buffer is sized with room to spare.
 */
const MAX_RENDER_QUANTUM = 1024

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
  private readonly hopSize: number
  private readonly windowSeconds: number

  private samplesSinceHop = 0
  private running = true
  private reportedOverrun = false

  constructor(options?: { processorOptions?: Record<string, unknown> }) {
    super()
    this.options = { ...DEFAULT_PITCH_PROCESSOR_OPTIONS, ...(options?.processorOptions ?? {}) }
    const layout = resolveProcessorLayout(sampleRate, this.options)
    this.hopSize = layout.hopSize
    this.windowSeconds = layout.bufferSize / layout.analysisRate

    // 20 Hz is an octave below the open E string, so this removes any offset
    // without touching the lowest note the instrument can produce.
    this.dcBlocker = FilterChain.butterworthHighpass(sampleRate, 20, 2)
    this.blocked = new Float32Array(MAX_RENDER_QUANTUM)
    this.decimator = new Decimator(sampleRate, layout.decimation)
    this.ring = new RingBuffer(layout.bufferSize)
    this.frame = new Float32Array(layout.bufferSize)

    this.yin = new YinDetector({
      sampleRate: layout.analysisRate,
      bufferSize: layout.bufferSize,
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

    this.port.onmessage = (event: MessageEvent<WorkletCommand>) => this.handleCommand(event.data)
  }

  /** Bound once: a fresh closure per render quantum is an allocation (AU1). */
  private readonly emitOnset = (onset: DetectedOnset): void => {
    this.port.postMessage({ type: 'onset', time: onset.time, level: onset.level })
  }

  private handleCommand(command: WorkletCommand | undefined): void {
    if (command?.type === 'stop') this.running = false
    if (command?.type === 'reset') this.reset()
  }

  private reset(): void {
    this.dcBlocker.reset()
    this.decimator.reset()
    this.ring.reset()
    this.onsets.reset()
    this.samplesSinceHop = 0
  }

  process(inputs: Float32Array[][]): boolean {
    if (!this.running) return false
    const channel = inputs[0]?.[0]
    if (!channel) return true

    const length = this.removeOffset(channel)
    this.onsets.process(this.blocked, currentTime, this.emitOnset, length)
    this.accumulate(length)
    if (this.shouldAnalyze()) this.analyze()
    return true
  }

  /**
   * Filters into a preallocated buffer and returns how much of it is valid.
   * The audio thread must not allocate, which rules out both a new buffer and
   * a subarray view of the existing one.
   */
  private removeOffset(channel: Float32Array): number {
    if (channel.length > this.blocked.length && !this.reportedOverrun) {
      this.reportedOverrun = true
      this.port.postMessage({ type: 'overrun', renderQuantum: channel.length })
    }
    const length = Math.min(channel.length, this.blocked.length)
    for (let i = 0; i < length; i++) this.blocked[i] = this.dcBlocker.process(channel[i])
    return length
  }

  private accumulate(length: number): void {
    for (let i = 0; i < length; i++) {
      const decimated = this.decimator.process(this.blocked[i])
      if (decimated === null) continue
      this.ring.push(decimated)
      this.samplesSinceHop++
    }
  }

  private shouldAnalyze(): boolean {
    return this.ring.isFull && this.samplesSinceHop >= this.hopSize
  }

  private analyze(): void {
    this.samplesSinceHop = 0
    this.ring.copyInto(this.frame)

    const rms = rootMeanSquare(this.frame)
    const result = rms > this.silenceFloor ? this.yin.detect(this.frame) : null

    this.port.postMessage({
      type: 'pitch',
      // currentTime is the end of the audio just analysed; the centre is what
      // the reading actually describes.
      time: currentTime - this.windowSeconds / 2,
      windowSeconds: this.windowSeconds,
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
