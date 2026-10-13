import type { PitchFrame } from '../audio/AudioEngine'

/**
 * Decides which note an attack was.
 *
 * Pitch and onset are detected separately: onsets are instant, pitch needs a
 * window of signal. So an attack is timestamped immediately and its pitch is
 * resolved shortly afterwards, from the frames that arrive while the note is
 * ringing.
 *
 * The first few milliseconds of a plucked note are mostly transient and read as
 * noise or as the wrong pitch entirely, so the window used starts after the
 * attack rather than at it, and the answer is the most common reading in that
 * window rather than the first or the average. A mean would land between two
 * notes whenever the detector flickered; the mode cannot.
 */

export interface PitchResolution {
  midi: number | null
  /** Cents from equal temperament of the chosen pitch. */
  cents: number
  /** Fraction of frames in the window that agreed, 0..1. */
  agreement: number
  frameCount: number
}

export interface PitchTrackerOptions {
  /** Skip this long after the attack before trusting the pitch. */
  settleMs: number
  /** Stop looking this long after the attack. */
  windowMs: number
  /** Frames below this clarity are ignored entirely. */
  minClarity: number
  /** How long to keep frames before discarding them. */
  retentionMs: number
}

export const DEFAULT_PITCH_TRACKER_OPTIONS: PitchTrackerOptions = {
  settleMs: 35,
  windowMs: 180,
  minClarity: 0.85,
  retentionMs: 3000,
}

export class PitchTracker {
  private frames: PitchFrame[] = []

  constructor(private readonly options: PitchTrackerOptions = DEFAULT_PITCH_TRACKER_OPTIONS) {}

  /** Frames must be pushed in the order they were produced. */
  push(frame: PitchFrame): void {
    this.frames.push(frame)
    this.forgetBefore(frame.time - this.options.retentionMs / 1000)
  }

  /** The pitch of the note that began at `onsetTime`, from frames seen so far. */
  resolve(onsetTime: number): PitchResolution {
    const { settleMs, windowMs, minClarity } = this.options
    const from = onsetTime + settleMs / 1000
    const to = onsetTime + windowMs / 1000

    const usable = this.frames.filter(
      (frame) =>
        frame.time >= from &&
        frame.time <= to &&
        frame.midi !== null &&
        frame.clarity >= minClarity,
    )
    if (usable.length === 0) return { midi: null, cents: 0, agreement: 0, frameCount: 0 }

    const counts = new Map<number, PitchFrame[]>()
    for (const frame of usable) {
      const group = counts.get(frame.midi as number) ?? []
      group.push(frame)
      counts.set(frame.midi as number, group)
    }

    const [midi, group] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0]
    const cents = group.reduce((sum, frame) => sum + frame.cents, 0) / group.length

    return {
      midi,
      cents: Number(cents.toFixed(1)),
      agreement: group.length / usable.length,
      frameCount: usable.length,
    }
  }

  /** True once enough time has passed that `resolve` will not improve. */
  isResolvable(onsetTime: number, now: number): boolean {
    return now >= onsetTime + this.options.windowMs / 1000
  }

  /** The most recent usable reading, for the live tuner and note display. */
  current(now: number, staleAfterMs = 250): PitchFrame | null {
    for (let index = this.frames.length - 1; index >= 0; index--) {
      const frame = this.frames[index]
      if (now - frame.time > staleAfterMs / 1000) return null
      if (frame.midi !== null && frame.clarity >= this.options.minClarity) return frame
    }
    return null
  }

  reset(): void {
    this.frames = []
  }

  private forgetBefore(time: number): void {
    const firstKept = this.frames.findIndex((frame) => frame.time >= time)
    if (firstKept > 0) this.frames = this.frames.slice(firstKept)
  }
}
