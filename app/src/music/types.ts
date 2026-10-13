import type { Position } from './fretboard'

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
  | 'quarter-notes'
  | 'eighth-notes'
  | 'rests-and-muting'
  | 'dotted-rhythms'
  | 'major-scale'
  | 'minor-scale'
  | 'octave-shape'
  | 'root-fifth'
  | 'position-shifts'
  | 'melody-playing'
  | 'repertoire'

/** A single thing the learner is asked to play. */
export interface TargetNote {
  /** Pitch as MIDI note number. */
  midi: number
  /** Where the exercise wants it played. Omit to accept any position. */
  position?: Position
  /** Onset, in beats from the start of the exercise body (after the count-in). */
  startBeat: number
  /** Written length in beats. Used for display and for muting/rest drills. */
  durationBeats: number
  /** Fretting-hand finger the lesson is teaching for this note. */
  finger?: 1 | 2 | 3 | 4
  /** Lyric or counting syllable shown under the note. */
  label?: string
}

export type PracticeMode =
  /** One note at a time, no clock. Waits for the right pitch. */
  | 'call-response'
  /** Scrolling timeline against a metronome. Judges pitch and timing. */
  | 'play-along'
  /** Metronome and chart only; nothing is graded. */
  | 'free-play'

export interface Exercise {
  id: string
  title: string
  /** One or two sentences shown above the fretboard while playing. */
  instructions: string
  mode: PracticeMode
  skills: SkillId[]
  timeSignature: [number, number]
  /** Tempo the exercise is considered "learned" at. */
  targetBpm: number
  /** Slowest tempo the ladder will drop to. */
  floorBpm: number
  countInBars: number
  notes: TargetNote[]
  /** Repeat the note list this many times within one take. */
  repeats?: number
  /** Shown in the chart as a reference; purely informational. */
  keyCenter?: string
  /** Free-text technique reminders listed beside the exercise. */
  tips?: string[]
}

export interface Lesson {
  id: string
  title: string
  summary: string
  /** Long-form explanation rendered before the first exercise. */
  briefing: string[]
  exerciseIds: string[]
  /** Lessons that must reach at least bronze before this one unlocks. */
  requires: string[]
  /** Rough minutes, used by the daily plan builder. */
  estimatedMinutes: number
}

export interface Unit {
  id: string
  title: string
  description: string
  lessonIds: string[]
}

export interface SongSection {
  id: string
  name: string
  /** Index into the song's bar list where this section begins. */
  startBar: number
  endBar: number
  notes?: string
}

export interface SongChart {
  id: string
  title: string
  artist: string
  /** Where the transcription came from, and how confident it is. */
  provenance: string
  keyCenter: string
  timeSignature: [number, number]
  targetBpm: number
  bars: SongBar[]
  sections: SongSection[]
  /** Exercises that break the song into learnable pieces. */
  exerciseIds: string[]
  performanceNotes: string[]
}

export interface SongBar {
  index: number
  chord?: string
  notes: TargetNote[]
}
