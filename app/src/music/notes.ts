/** Pitch arithmetic shared by the detector, the fretboard, and the exercises. */

export const A4_MIDI = 69
export const A4_FREQUENCY = 440

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export type Accidental = 'sharp' | 'flat'

export function midiToFrequency(midi: number): number {
  return A4_FREQUENCY * Math.pow(2, (midi - A4_MIDI) / 12)
}

export function frequencyToMidi(frequency: number): number {
  return A4_MIDI + 12 * Math.log2(frequency / A4_FREQUENCY)
}

/** Signed distance in cents from `frequency` to the nearest equal-tempered pitch. */
export function centsFromNearestNote(frequency: number): { midi: number; cents: number } {
  const exact = frequencyToMidi(frequency)
  const midi = Math.round(exact)
  return { midi, cents: (exact - midi) * 100 }
}

/** Move a frequency by an interval expressed in cents. */
export function shiftByCents(frequency: number, cents: number): number {
  return frequency * 2 ** (cents / 1200)
}

export function centsBetween(frequency: number, referenceMidi: number): number {
  return (frequencyToMidi(frequency) - referenceMidi) * 100
}

export function pitchClassName(midi: number, accidental: Accidental = 'flat'): string {
  const names = accidental === 'sharp' ? SHARP_NAMES : FLAT_NAMES
  return names[((midi % 12) + 12) % 12]
}

export function noteName(midi: number, accidental: Accidental = 'flat'): string {
  return `${pitchClassName(midi, accidental)}${octaveOf(midi)}`
}

export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1
}

/**
 * Parse scientific pitch notation ("Eb2", "F#1", "C4") into a MIDI number.
 * Exercise content is authored with note names because they survive review by
 * a human far better than bare integers do.
 */
export function parseNote(name: string): number {
  const match = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(name.trim())
  if (!match) throw new Error(`Not a pitch name: ${name}`)
  const [, letter, accidentals, octave] = match
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter.toUpperCase() as 'C']
  let alter = 0
  for (const character of accidentals) alter += character === '#' ? 1 : -1
  return (Number(octave) + 1) * 12 + base + alter
}

/** Interval name used in drills, e.g. 7 -> "perfect 5th". */
const INTERVAL_NAMES = [
  'unison',
  'minor 2nd',
  'major 2nd',
  'minor 3rd',
  'major 3rd',
  'perfect 4th',
  'tritone',
  'perfect 5th',
  'minor 6th',
  'major 6th',
  'minor 7th',
  'major 7th',
  'octave',
]

export function intervalName(semitones: number): string {
  const distance = Math.abs(semitones)
  if (distance <= 12) return INTERVAL_NAMES[distance]
  return `${INTERVAL_NAMES[distance % 12]} + ${Math.floor(distance / 12)} octave(s)`
}

/**
 * How far from equal temperament still counts as in tune, in cents.
 *
 * Five cents is roughly the point at which a trained ear stops hearing a
 * difference against a reference on a bass note, and it is tighter than the
 * drift a wound string shows across a room's temperature change, so a string
 * tuned inside it stays inside it for a practice session.
 */
export const IN_TUNE_CENTS = 5

export type TuningState = 'in-tune' | 'sharp' | 'flat'

export function tuningStateOf(cents: number): TuningState {
  if (Math.abs(cents) <= IN_TUNE_CENTS) return 'in-tune'
  return cents > 0 ? 'sharp' : 'flat'
}
