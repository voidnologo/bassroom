import type { PerformanceScore, Verdict } from '../engine/judge'

/**
 * The boundary between the app and whatever is giving feedback.
 *
 * The whole point of this layer is that the thing on the other side of it gets
 * better over time without the app changing. Two rules make that possible:
 * providers return structured data rather than prose for the UI to parse, and
 * telemetry records what was measured rather than what it was taken to mean.
 */

/** Bumped whenever the telemetry shape changes. Stored with every record. */
export const TELEMETRY_SCHEMA_VERSION = 1

export interface NoteTelemetry {
  /** Index into the exercise's note list. */
  index: number
  bar: number
  beatInBar: number
  targetMidi: number
  playedMidi: number | null
  /** Signed, latency-corrected, in milliseconds. Negative is early. */
  timingErrorMs: number | null
  /** Signed, in semitones. */
  semitoneError: number | null
  /** Distance from equal temperament of the pitch actually sounded. */
  centsOffset: number | null
  /** Attack level, 0..1. */
  level: number | null
  verdict: Verdict
  string: number | null
  fret: number | null
}

export interface TakeTelemetry {
  schemaVersion: number
  takeId: string
  recordedAt: string
  exercise: {
    id: string
    title: string
    skills: string[]
    targetBpm: number
    timeSignature: [number, number]
    noteCount: number
  }
  bpm: number
  /** Latency correction applied to every onset in this take, in milliseconds. */
  latencyCorrectionMs: number
  score: PerformanceScore
  notes: NoteTelemetry[]
  learner: {
    level: number
    totalAttempts: number
    attemptsOnThisExercise: number
    bestStarsOnThisExercise: number
    daysSinceFirstPractice: number
  }
}

export type ObservationSeverity = 'info' | 'watch' | 'fix'

export interface Observation {
  /** Stable identifier, so the UI and the history can group repeats. */
  id: string
  severity: ObservationSeverity
  /** What happened, in one sentence. */
  statement: string
  /** The measurement behind the statement, so the learner can check it. */
  evidence: string
}

export type NextActionKind =
  'repeat' | 'slow-down' | 'speed-up' | 'isolate' | 'switch-exercise' | 'rest'

export interface NextAction {
  kind: NextActionKind
  /** What to do, addressed to the learner. */
  detail: string
  bpm?: number
}

export interface CoachFeedback {
  /** Which provider produced this, for the history and for debugging. */
  providerId: string
  /** One sentence, the first thing shown after a take. */
  headline: string
  observations: Observation[]
  nextAction: NextAction
  confidence: 'low' | 'medium' | 'high'
}

export interface CoachRequest {
  telemetry: TakeTelemetry
  /** Telemetry from recent takes of the same exercise, newest first. */
  recentTakes: TakeTelemetry[]
}

export interface CoachProvider {
  readonly id: string
  readonly label: string
  /** Whether this provider can be used right now. */
  isAvailable(): Promise<boolean>
  analyze(request: CoachRequest): Promise<CoachFeedback>
}
