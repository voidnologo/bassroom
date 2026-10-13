import { STANDARD_TUNING, STRING_LABELS, type Position } from '../music/fretboard'
import type { SongBar, TargetNote, TimeSignature } from '../music/types'

/**
 * Helpers for writing song and exercise content.
 *
 * Content is authored by *position* rather than by pitch, and the pitch is
 * derived. A string and a fret is what a player is actually told to do, it is
 * unambiguous, and deriving the pitch from it means the two can never disagree
 * - which they would, eventually, if both were written out by hand.
 */

/** Parse a position written as a string letter and a fret, e.g. "A6", "E10". */
export function at(spec: string): Position {
  const match = /^([EADG])(\d{1,2})$/.exec(spec.trim())
  if (!match) throw new Error(`Not a fret position: ${spec}. Expected e.g. "A3" or "E10".`)
  const string = STRING_LABELS.indexOf(match[1] as (typeof STRING_LABELS)[number])
  const fret = Number(match[2])
  if (fret > 24) throw new Error(`Fret ${fret} is beyond the neck in "${spec}"`)
  return { string, fret }
}

export function midiOf(position: Position): number {
  return STANDARD_TUNING[position.string] + position.fret
}

/** One note: where to play it, when it starts, and how long it is held. */
export function note(
  spec: string,
  startBeat: number,
  durationBeats: number,
  extras: Partial<Pick<TargetNote, 'finger' | 'label'>> = {},
): TargetNote {
  const position = at(spec)
  return { midi: midiOf(position), position, startBeat, durationBeats, ...extras }
}

/** A run of equal-length notes starting on consecutive beats. */
export function steady(specs: string[], startBeat = 0, durationBeats = 1): TargetNote[] {
  return specs.map((spec, index) => note(spec, startBeat + index * durationBeats, durationBeats))
}

export interface BarInput {
  chord?: string
  timeSignature?: TimeSignature
  notes: TargetNote[]
}

/**
 * Number bars from `firstIndex` and keep each bar's beats relative to itself,
 * which is how a chart is read and how a renderer wants them.
 */
export function bars(inputs: BarInput[], firstIndex = 1): SongBar[] {
  return inputs.map((input, offset) => ({ index: firstIndex + offset, ...input }))
}

/** Flatten a chart's bars into one absolute-beat note list for the player. */
export function flattenBars(barList: SongBar[], chartSignature: TimeSignature): TargetNote[] {
  let elapsed = 0
  let beatsPerBar = chartSignature[0]
  const flattened: TargetNote[] = []
  for (const bar of barList) {
    if (bar.timeSignature) beatsPerBar = bar.timeSignature[0]
    for (const barNote of bar.notes) {
      flattened.push({ ...barNote, startBeat: elapsed + barNote.startBeat })
    }
    elapsed += beatsPerBar
  }
  return flattened
}

/** Total length of a bar list in beats, honouring mid-chart meter changes. */
export function totalBeats(barList: SongBar[], chartSignature: TimeSignature): number {
  let beatsPerBar = chartSignature[0]
  return barList.reduce((sum, bar) => {
    if (bar.timeSignature) beatsPerBar = bar.timeSignature[0]
    return sum + beatsPerBar
  }, 0)
}

/**
 * Stamp every bar with the time signature in force at that point.
 *
 * A meter change is written once, on the bar where it happens. That makes the
 * content readable but means a slice of the chart that begins after the change
 * has lost it - which is how the 4/4 chorus of a 3/4 hymn ends up rendered
 * three beats wide. Resolving first makes any slice self-contained.
 */
export function resolveSignatures(barList: SongBar[], chartSignature: TimeSignature): SongBar[] {
  let inForce = chartSignature
  return barList.map((bar) => {
    if (bar.timeSignature) inForce = bar.timeSignature
    return { ...bar, timeSignature: inForce }
  })
}
