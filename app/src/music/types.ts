import type { Finger, Position } from './fretboard'
import type { MeterChange } from './meter'

export type SkillId =
  | 'posture'
  | 'tuning'
  | 'plucking-open'
  | 'alternating-fingers'
  | 'fretting-basics'
  | 'string-crossing'
  | 'note-names-e'
  | 'note-names-a'
  | 'note-names-d-g'
  | 'reading-tab'
  | 'quarter-notes'
  | 'eighth-notes'
  | 'sixteenth-notes'
  | 'rests-and-muting'
  | 'dotted-rhythms'
  | 'major-scale'
  | 'minor-scale'
  | 'octave-shape'
  | 'root-fifth'
  | 'position-shifts'
  | 'melody-playing'
  | 'repertoire'

export type TimeSignature = readonly [beats: number, beatUnit: number]

/** A single thing the learner is asked to play. */
export interface TargetNote {
  /** Pitch as a MIDI note number, derived from `position` when content is authored. */
  midi: number
  /** Where the arrangement wants it played. */
  position?: Position
  /** Onset in beats from the start of the exercise body, after the count-in. */
  startBeat: number
  /** Written length in beats. Drives display, and rest and muting drills. */
  durationBeats: number
  /** Fretting-hand finger this lesson is teaching for the note. */
  finger?: Finger
  /** Lyric or counting syllable shown beneath the note. */
  label?: string
}

export type PracticeMode =
  /** One note at a time, no clock. Waits for the right pitch. */
  | 'call-response'
  /** Scrolling timeline against a metronome. Judges pitch and timing. */
  | 'play-along'

interface ExerciseBase {
  id: string
  title: string
  /** One or two sentences shown above the fretboard while playing. */
  instructions: string
  skills: SkillId[]
  timeSignature: TimeSignature
  /**
   * Meter changes partway through, for music that does not stay in one.
   * Beats are relative to the start of the exercise body.
   */
  meterChanges?: MeterChange[]
  countInBars: number
  notes: TargetNote[]
  /** Repeat the note list this many times within one take. */
  repeats?: number
  /** Ask for the notes in a fresh order each take, so the order cannot be learned. */
  shuffleEachTake?: boolean
  keyCenter?: string
  /** Technique reminders listed beside the exercise. */
  tips?: string[]
}

/** Played against a metronome, and worked up the tempo ladder. */
export interface TimedExercise extends ExerciseBase {
  mode: 'play-along'
  /** Tempo at which the exercise counts as learned. */
  targetBpm: number
  /** Slowest tempo the ladder will drop to. */
  floorBpm: number
}

/**
 * No metronome. There is no tempo to reach, no floor to drop back to and no
 * ladder to climb, so the exercise does not carry the numbers that describe
 * one. `src/music/meter.ts::isTimed` narrows an exercise to the other case.
 */
export interface UntimedExercise extends ExerciseBase {
  mode: 'call-response'
}

export type Exercise = TimedExercise | UntimedExercise

export interface Lesson {
  id: string
  title: string
  summary: string
  /** Long-form explanation shown before the first exercise. */
  briefing: string[]
  exerciseIds: string[]
  /** Lessons that must reach at least one star before this one unlocks. */
  requires: string[]
  estimatedMinutes: number
}

export interface Unit {
  id: string
  title: string
  description: string
  lessonIds: string[]
}

export interface SongBar {
  /** 1-based bar number as printed on the chart. */
  index: number
  chord?: string
  /** Overrides the chart's time signature from this bar onward. */
  timeSignature?: TimeSignature
  /** Beats are relative to the start of this bar. */
  notes: TargetNote[]
}

export interface SongSection {
  id: string
  name: string
  startBar: number
  endBar: number
  notes?: string
}

/**
 * One way to play a song. Charts carry several, from chord roots up to the
 * full line, so the same song serves as a first attempt and as a destination.
 */
export interface Arrangement {
  id: string
  name: string
  description: string
  /** 1 easiest, 3 the full part. */
  difficulty: 1 | 2 | 3
  bars: SongBar[]
}

export interface SongChart {
  id: string
  title: string
  artist: string
  /** Where these notes came from, and how much to trust them. Required: MC3. */
  provenance: string
  keyCenter: string
  timeSignature: TimeSignature
  targetBpm: number
  floorBpm: number
  sections: SongSection[]
  arrangements: Arrangement[]
  performanceNotes: string[]
}
