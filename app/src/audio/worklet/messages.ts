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
  /** AudioContext time of the analysis window. */
  time: number
  /** 0 when no pitch was found. */
  frequency: number
  clarity: number
  rms: number
}

export interface OnsetMessage {
  type: 'onset'
  time: number
  level: number
}

export type WorkletMessage = PitchMessage | OnsetMessage

export interface StopCommand {
  type: 'stop'
}

export type WorkletCommand = StopCommand

export interface PitchProcessorOptions {
  /** Decimation factor applied before pitch analysis. */
  decimation: number
  /** Analysis frame length, in decimated samples. */
  bufferSize: number
  /** Decimated samples between analyses. */
  hopSize: number
  minFrequency: number
  maxFrequency: number
  yinThreshold: number
  onsetRiseRatio: number
  onsetFloorDb: number
  onsetRefractoryMs: number
}

export const PITCH_PROCESSOR_NAME = 'pitch-processor'

/**
 * Defaults chosen for a 4-string bass at 48 kHz:
 *   - decimation 4 gives a 12 kHz analysis rate,
 *   - 1536 frames is 128 ms, which holds four periods of the 41 Hz low E
 *     (YIN needs two, and is markedly steadier with four),
 *   - a 256-frame hop analyses about every 21 ms.
 */
export const DEFAULT_PITCH_PROCESSOR_OPTIONS: PitchProcessorOptions = {
  decimation: 4,
  bufferSize: 1536,
  hopSize: 256,
  ...DEFAULT_YIN_OPTIONS,
  yinThreshold: DEFAULT_YIN_OPTIONS.threshold,
  onsetRiseRatio: DEFAULT_ONSET_OPTIONS.riseRatio,
  onsetFloorDb: DEFAULT_ONSET_OPTIONS.floorDb,
  onsetRefractoryMs: DEFAULT_ONSET_OPTIONS.refractoryMs,
}
