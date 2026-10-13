import { DEFAULT_ONSET_OPTIONS } from '../dsp/onset'
import { DEFAULT_YIN_OPTIONS } from '../dsp/yin'

/**
 * The contract between the audio thread and the main thread.
 *
 * Both sides import these types, so a change to the message shape is a compile
 * error rather than a silent runtime mismatch across a postMessage boundary.
 */

export interface PitchMessage {
  type: 'pitch'
  /**
   * Centre of the analysis window, on the AudioContext clock.
   *
   * Not the time the analysis ran: a reading describes 128 ms of audio, and a
   * consumer attributing a pitch to a note needs to know which audio it covers.
   * The span is sent with it so that can be worked out exactly.
   */
  time: number
  /** Length of audio the reading covers, in seconds. */
  windowSeconds: number
  /** 0 when no pitch was found. */
  frequency: number
  clarity: number
  rms: number
}

export interface OnsetMessage {
  type: 'onset'
  time: number
  level: number
  /** Amplitude ratio over the reference envelope at the attack. */
  riseRatio: number
}

/** Sent once if the processor has to drop samples it cannot buffer. */
export interface OverrunMessage {
  type: 'overrun'
  renderQuantum: number
}

export type WorkletMessage = PitchMessage | OnsetMessage | OverrunMessage

export interface StopCommand {
  type: 'stop'
}

/** Clear filter and envelope state so a new take does not inherit the last one. */
export interface ResetCommand {
  type: 'reset'
}

export type WorkletCommand = StopCommand | ResetCommand

export interface PitchProcessorOptions {
  /** Analysis rate to aim for after decimation, in Hz. */
  targetAnalysisRate: number
  /** Length of the analysis window, in seconds. */
  windowSeconds: number
  /** Time between analyses, in seconds. */
  hopSeconds: number
  minFrequency: number
  maxFrequency: number
  yinThreshold: number
  onsetRiseRatio: number
  onsetFloorDb: number
  onsetRefractoryMs: number
}

export const PITCH_PROCESSOR_NAME = 'pitch-processor'

/**
 * Defaults for a 4-string bass, expressed in seconds and hertz rather than in
 * samples.
 *
 * The sample-rate-dependent figures - decimation factor and buffer length -
 * are derived in the processor from whatever rate the device is actually
 * running at. Hard-coding them for 48 kHz made the detector silently wrong at
 * 44.1 kHz and made its constructor throw outright at 192 kHz, both of which
 * are ordinary settings on an audio interface.
 *
 * 128 ms holds four periods of the 41 Hz low E; YIN needs two and is markedly
 * steadier with four.
 */
export const DEFAULT_PITCH_PROCESSOR_OPTIONS: PitchProcessorOptions = {
  targetAnalysisRate: 12000,
  windowSeconds: 0.128,
  hopSeconds: 0.021,
  minFrequency: DEFAULT_YIN_OPTIONS.minFrequency,
  maxFrequency: DEFAULT_YIN_OPTIONS.maxFrequency,
  yinThreshold: DEFAULT_YIN_OPTIONS.threshold,
  onsetRiseRatio: DEFAULT_ONSET_OPTIONS.riseRatio,
  onsetFloorDb: DEFAULT_ONSET_OPTIONS.floorDb,
  onsetRefractoryMs: DEFAULT_ONSET_OPTIONS.refractoryMs,
}

/**
 * Pick a decimation factor landing the analysis rate nearest the target, and a
 * window long enough for the lowest note the detector claims to find.
 */
export function resolveProcessorLayout(
  sampleRate: number,
  options: PitchProcessorOptions,
): { decimation: number; analysisRate: number; bufferSize: number; hopSize: number } {
  const decimation = Math.max(1, Math.round(sampleRate / options.targetAnalysisRate))
  const analysisRate = sampleRate / decimation

  const longestPeriod = Math.ceil(analysisRate / options.minFrequency)
  const wanted = Math.round(analysisRate * options.windowSeconds)
  const bufferSize = Math.max(wanted, longestPeriod * 2)

  return {
    decimation,
    analysisRate,
    bufferSize,
    hopSize: Math.max(1, Math.round(analysisRate * options.hopSeconds)),
  }
}
