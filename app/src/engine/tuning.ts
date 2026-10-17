import type { PitchFrame } from '../audio/contracts'
import { DEFAULT_PITCH_TRACKER_OPTIONS } from './PitchTracker'

/**
 * A steady pitch for a tuner to point at, from the readings of the last moment.
 *
 * The instantaneous reading is not it. A reading describes a 128 ms window of
 * audio, so one taken shortly after a pluck covers mostly the audio before it:
 * the previous note, and the inharmonic first few milliseconds of the new one.
 * Measured on a recorded take, readings in the first 50 ms after an attack
 * spread across 574 cents - nearly five semitones - while readings from 50 ms
 * onward sit inside 11. Those early readings are not low-confidence, so a
 * clarity gate does not remove them; there are simply few of them, which is
 * what the mode and the median exploit.
 *
 * The answer is the most common note among recent readings and the median of
 * its offsets, for the same reason the take judge uses a mode: a mean lands
 * between two notes whenever the detector changes its mind, on a pitch nobody
 * played.
 */

export interface SettledPitch {
  midi: number
  /** Median cents from equal temperament among the readings that agreed. */
  cents: number
  /** How many readings stand behind it. */
  frames: number
}

export interface SettledPitchOptions {
  /** How far back to look. Long enough to outvote an attack, short enough to follow a tuning peg. */
  windowSeconds: number
  minClarity: number
  /** Below this there is not enough agreement to point at anything. */
  minFrames: number
}

export const DEFAULT_SETTLED_PITCH_OPTIONS: SettledPitchOptions = {
  windowSeconds: 0.5,
  minClarity: DEFAULT_PITCH_TRACKER_OPTIONS.minClarity,
  minFrames: 4,
}

export function settledPitch(
  frames: readonly PitchFrame[],
  now: number,
  options: SettledPitchOptions = DEFAULT_SETTLED_PITCH_OPTIONS,
): SettledPitch | null {
  const usable = frames.filter(
    (frame) =>
      frame.midi !== null &&
      frame.clarity >= options.minClarity &&
      frame.time >= now - options.windowSeconds,
  )
  if (usable.length < options.minFrames) return null

  const byNote = new Map<number, number[]>()
  for (const frame of usable) {
    const group = byNote.get(frame.midi as number) ?? []
    group.push(frame.cents)
    byNote.set(frame.midi as number, group)
  }

  const [midi, offsets] = [...byNote.entries()].sort((a, b) => b[1].length - a[1].length)[0]
  if (offsets.length < options.minFrames) return null
  return { midi, cents: median(offsets), frames: offsets.length }
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = sorted.length >> 1
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}
