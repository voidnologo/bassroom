import type { OnsetEvent, PitchFrame } from './contracts'

/**
 * A raw record of what the detector saw during a take, for tuning its
 * constants against a real instrument.
 *
 * Telemetry says what a note was judged to be. This says what the signal
 * looked like underneath that judgment, which is the part that tells you
 * whether a threshold is in the right place rather than merely that it is
 * wrong. It is off by default: nothing here is needed to practise, and a take
 * produces thousands of frames.
 */

export const DIAGNOSTICS_SCHEMA_VERSION = 1

/**
 * Frames arrive at roughly 47 Hz, so this is about four minutes of continuous
 * analysis. The cap exists because the whole record is posted in one body and
 * the coach server rejects anything over 2 MB; at the rounding used below a
 * frame costs well under 100 bytes.
 */
export const MAX_RECORDED_FRAMES = 12_000

export interface FrameSample {
  time: number
  frequency: number
  clarity: number
  rms: number
  midi: number | null
  cents: number
}

export interface OnsetSample {
  time: number
  level: number
  riseRatio: number
}

export interface CalibrationDetail {
  /** Signed offset of each tap from the click it belongs to, in milliseconds. */
  tapOffsetsMs: number[]
  offsetMs: number
  spreadMs: number
  quality: string
}

export interface DiagnosticsRecord {
  schemaVersion: number
  kind: 'take' | 'calibration'
  recordedAt: string
  /** Ties this back to the matching record in the take telemetry. */
  takeId: string | null
  exerciseId: string | null
  bpm: number | null
  latencyCorrectionMs: number | null
  frames: FrameSample[]
  onsets: OnsetSample[]
  /** How many frames were dropped after the cap was reached. */
  framesDropped: number
  calibration: CalibrationDetail | null
}

export interface RecordMetadata {
  kind: DiagnosticsRecord['kind']
  now: Date
  takeId?: string | null
  exerciseId?: string | null
  bpm?: number | null
  latencyCorrectionMs?: number | null
  calibration?: CalibrationDetail | null
}

export class DiagnosticsRecorder {
  private frames: FrameSample[] = []
  private onsets: OnsetSample[] = []
  private dropped = 0

  addFrame(frame: PitchFrame): void {
    if (this.frames.length >= MAX_RECORDED_FRAMES) {
      this.dropped += 1
      return
    }
    this.frames.push({
      time: round(frame.time, 4),
      frequency: round(frame.frequency, 2),
      clarity: round(frame.clarity, 3),
      rms: round(frame.rms, 4),
      midi: frame.midi,
      cents: round(frame.cents, 1),
    })
  }

  addOnset(event: OnsetEvent): void {
    this.onsets.push({
      time: round(event.time, 4),
      level: round(event.level, 4),
      // Infinity means an attack out of silence; JSON would write it as null.
      riseRatio: Number.isFinite(event.riseRatio) ? round(event.riseRatio, 2) : -1,
    })
  }

  build(meta: RecordMetadata): DiagnosticsRecord {
    return {
      schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
      kind: meta.kind,
      recordedAt: meta.now.toISOString(),
      takeId: meta.takeId ?? null,
      exerciseId: meta.exerciseId ?? null,
      bpm: meta.bpm ?? null,
      latencyCorrectionMs: meta.latencyCorrectionMs ?? null,
      frames: [...this.frames],
      onsets: [...this.onsets],
      framesDropped: this.dropped,
      calibration: meta.calibration ?? null,
    }
  }

  reset(): void {
    this.frames = []
    this.onsets = []
    this.dropped = 0
  }
}

function round(value: number, places: number): number {
  if (!Number.isFinite(value)) return 0
  return Number(value.toFixed(places))
}
