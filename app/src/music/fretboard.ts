import { midiToFrequency, noteName } from './notes'

/**
 * Strings are indexed from the physically lowest-pitched one upward
 * (0 = E, 1 = A, 2 = D, 3 = G) because every position calculation below is
 * "open pitch plus fret". The fretboard view flips the order for display, where
 * the convention is that the thinnest string is drawn on top.
 */
export const STANDARD_TUNING = [28, 33, 38, 43] as const // E1 A1 D2 G2
export const STRING_LABELS = ['E', 'A', 'D', 'G'] as const
export const FRET_COUNT = 20

/** Fret markers as they appear on almost every bass: single dots, then a double. */
export const SINGLE_DOT_FRETS = [3, 5, 7, 9, 15, 17, 19]
export const DOUBLE_DOT_FRETS = [12]

export interface Position {
  string: number
  fret: number
}

export interface TuningInfo {
  midi: number
  frequency: number
  label: string
}

export function openStrings(tuning: readonly number[] = STANDARD_TUNING): TuningInfo[] {
  return tuning.map((midi, index) => ({
    midi,
    frequency: midiToFrequency(midi),
    label: STRING_LABELS[index] ?? noteName(midi),
  }))
}

export function midiAt(position: Position, tuning: readonly number[] = STANDARD_TUNING): number {
  return tuning[position.string] + position.fret
}

export function isPlayable(midi: number, tuning: readonly number[] = STANDARD_TUNING): boolean {
  return midi >= tuning[0] && midi <= tuning[tuning.length - 1] + FRET_COUNT
}

/** Every string/fret pair that sounds the given pitch, lowest string first. */
export function positionsFor(
  midi: number,
  tuning: readonly number[] = STANDARD_TUNING,
  maxFret: number = FRET_COUNT,
): Position[] {
  const positions: Position[] = []
  tuning.forEach((openMidi, string) => {
    const fret = midi - openMidi
    if (fret >= 0 && fret <= maxFret) positions.push({ string, fret })
  })
  return positions
}

/**
 * Pick the position a teacher would point at: stay in the hand position the
 * player is already in, prefer lower frets, and prefer the thicker string when
 * frets tie, since that is where a beginner's hand naturally sits.
 */
export function preferredPosition(
  midi: number,
  options: { anchorFret?: number; preferOpen?: boolean; tuning?: readonly number[] } = {},
): Position | null {
  const { anchorFret, preferOpen = true, tuning = STANDARD_TUNING } = options
  const candidates = positionsFor(midi, tuning)
  if (candidates.length === 0) return null

  const score = (position: Position): number => {
    if (preferOpen && position.fret === 0) return -10
    if (anchorFret === undefined) return position.fret + position.string * 0.1
    const reach = Math.abs(position.fret - anchorFret)
    const outOfHand = reach > 4 ? (reach - 4) * 6 : 0
    return reach + outOfHand + position.string * 0.1
  }

  return candidates.reduce((best, position) => (score(position) < score(best) ? position : best))
}

/** Fretting-hand fingers, numbered from the index outward. The thumb has none. */
export type Finger = 1 | 2 | 3 | 4

const FINGER_NAMES: Record<Finger, string> = {
  1: 'index',
  2: 'middle',
  3: 'ring',
  4: 'little',
}

export function fingerName(finger: Finger): string {
  return FINGER_NAMES[finger]
}

/**
 * One-finger-per-fret assignment relative to where the index finger sits.
 * Returns null for open strings and for notes outside the four-fret span.
 */
export function suggestedFinger(position: Position, indexFret: number): Finger | null {
  if (position.fret === 0) return null
  const offset = position.fret - indexFret
  if (offset < 0 || offset > 3) return null
  return (offset + 1) as Finger
}

export function describePosition(position: Position): string {
  const label = STRING_LABELS[position.string]
  return position.fret === 0 ? `open ${label}` : `${label} string, fret ${position.fret}`
}
