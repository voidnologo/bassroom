import type { PitchFrame } from '../audio/contracts'

/**
 * Decides which note an attack was.
 *
 * Pitch and onset are detected separately: onsets are instant, pitch needs a
 * window of signal. So an attack is timestamped immediately and its pitch is
 * resolved shortly afterwards, from the frames that arrive while the note is
 * ringing.
 *
 * Which readings count is decided by the audio each one covers, not by its
 * timestamp. A reading describes a window of audio around its own time, so a
 * reading taken shortly after an attack is mostly the *previous* note. Only
 * readings whose window began at or after the attack are counted.
 *
 * The answer is the most common reading among those, not the first or the
 * average: a mean would land between two notes whenever the detector flickered,
 * on a pitch nobody played. The mode cannot.
 */

export interface PitchResolution {
  midi: number | null
  /** Cents from equal temperament of the chosen pitch. */
  cents: number
  /** Fraction of frames in the window that agreed, 0..1. */
}

export interface PitchTrackerOptions {
  /**
   * Allow a reading whose window began this long before the attack. A little
   * slack covers the detector's own timing granularity without admitting a
   * window that is mostly the note before.
   */
  leadToleranceMs: number
  /** Stop collecting readings this long after the attack. */
  listenForMs: number
  /** Frames below this clarity are ignored entirely. */
  minClarity: number
  /** How long to keep frames before discarding them. */
  retentionMs: number
}

export const DEFAULT_PITCH_TRACKER_OPTIONS: PitchTrackerOptions = {
  leadToleranceMs: 10,
  listenForMs: 320,
  minClarity: 0.85,
  retentionMs: 3000,
}

/** The start of the audio a reading describes. */
function windowStart(frame: PitchFrame): number {
  return frame.time - frame.windowSeconds / 2
}

/** Enough time after the first usable reading for a couple more to arrive. */
const MINIMUM_AGREEMENT_SECONDS = 0.05

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
    const { leadToleranceMs, listenForMs, minClarity } = this.options
    const earliestStart = onsetTime - leadToleranceMs / 1000
    const latest = onsetTime + listenForMs / 1000

    const usable = this.frames.filter(
      (frame) =>
        windowStart(frame) >= earliestStart &&
        frame.time <= latest &&
        frame.midi !== null &&
        frame.clarity >= minClarity,
    )
    if (usable.length === 0) return { midi: null, cents: 0 }

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
    }
  }

  /**
   * True once enough time has passed that `resolve` will not improve. A reading
   * is only usable once its whole window is past the attack, so this waits for
   * the audio, not just for the clock.
   */
  isResolvable(onsetTime: number, now: number): boolean {
    const firstUsable = this.frames.find(
      (frame) => windowStart(frame) >= onsetTime - this.options.leadToleranceMs / 1000,
    )
    if (firstUsable && now >= firstUsable.time + MINIMUM_AGREEMENT_SECONDS) return true
    return now >= onsetTime + this.options.listenForMs / 1000
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
