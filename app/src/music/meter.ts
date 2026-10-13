import type { TimeSignature } from './types'

/**
 * Where a beat falls in the music when the meter changes partway through.
 *
 * A scalar time signature cannot describe "This Is the Christ": it is in 3/4
 * for eleven bars and 4/4 after that. Dividing by a single figure put every bar
 * reference past the change one beat out and drifting - including the ones the
 * coach quotes back to the learner.
 */

export interface MeterChange {
  /** Body beat at which the new signature takes effect. */
  atBeat: number
  timeSignature: TimeSignature
}

export interface BarPosition {
  /** 1-based bar number. */
  bar: number
  /** 1-based position within the bar. */
  beatInBar: number
}

/** The signature in force at a given beat. */
export function signatureAt(
  beat: number,
  base: TimeSignature,
  changes: readonly MeterChange[] = [],
): TimeSignature {
  let current = base
  for (const change of changes) {
    if (change.atBeat <= beat) current = change.timeSignature
  }
  return current
}

export function beatsPerBarAt(
  beat: number,
  base: TimeSignature,
  changes: readonly MeterChange[] = [],
): number {
  return signatureAt(beat, base, changes)[0]
}

/**
 * Walks the meter changes in order rather than dividing, because once the bar
 * length varies there is no single divisor that gets both halves right.
 */
export function barPositionAt(
  beat: number,
  base: TimeSignature,
  changes: readonly MeterChange[] = [],
): BarPosition {
  const ordered = [...changes].sort((a, b) => a.atBeat - b.atBeat)
  let barsBefore = 0
  let sectionStart = 0
  let beatsPerBar = base[0]

  for (const change of ordered) {
    if (change.atBeat > beat) break
    barsBefore += Math.round((change.atBeat - sectionStart) / beatsPerBar)
    sectionStart = change.atBeat
    beatsPerBar = change.timeSignature[0]
  }

  const into = beat - sectionStart
  const bar = barsBefore + Math.floor(into / beatsPerBar) + 1
  const beatInBar = (into % beatsPerBar) + 1
  return { bar, beatInBar: Number(beatInBar.toFixed(3)) }
}
