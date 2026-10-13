import type { PerformanceScore } from '../engine/judge'
import type { LadderState, Star } from '../engine/tempoLadder'
import type { SkillId } from '../music/types'

/** Schema version for everything persisted and everything sent to a coach. */
export const PROGRESS_SCHEMA_VERSION = 1

/**
 * What the learner guessed about their own timing before being shown it.
 *
 * Asking costs two seconds and is the best-evidenced single intervention in the
 * motor-learning literature for building an internal error-detection sense,
 * which is what lets someone practise usefully without the app.
 */
export type SelfEstimate = 'ahead' | 'behind' | 'on-it'

/** One completed take of one exercise. */
export interface Attempt {
  exerciseId: string
  /** ISO 8601, in the learner's local time zone. */
  completedAt: string
  bpm: number
  targetBpm: number
  score: PerformanceScore
  stars: Star
  /** Seconds of actual playing, excluding the count-in. */
  durationSeconds: number
  /**
   * A probe is played with the feedback display off, and is the honest measure
   * of what has been learned. Accuracy during guided practice is inflated by
   * the guidance itself, so a product that reports it as progress is reporting
   * the wrong number.
   */
  isProbe: boolean
  selfEstimate: SelfEstimate | null
  /** Whether the guess matched the measurement. Null when no guess was made. */
  estimateWasRight: boolean | null
}

/**
 * Spaced repetition state, SM-2 in shape but tuned for motor skills.
 *
 * Intervals are shorter than they would be for facts: a physical pattern decays
 * faster than a memorised one, and the cost of refreshing it is a minute rather
 * than a card review.
 */
export interface ReviewState {
  /** Multiplier applied to the interval on a success. */
  ease: number
  intervalDays: number
  /** ISO date (no time) the exercise next comes up. */
  dueOn: string
  /** Consecutive successful reviews. */
  streak: number
  /** Times this exercise has been failed after previously being learned. */
  lapses: number
}

export interface ExerciseProgress {
  exerciseId: string
  attempts: number
  bestStars: Star
  bestScore: number
  bestBpm: number
  ladder: LadderState
  review: ReviewState
  lastPracticedAt: string | null
}

export interface SkillStrength {
  skill: SkillId
  /** 0..1, blended from the best scores of every exercise training it. */
  strength: number
  exerciseCount: number
}

export type BadgeId =
  | 'first-note'
  | 'first-star'
  | 'three-stars'
  | 'week-streak'
  | 'month-streak'
  | 'full-tempo'
  | 'angel-complete'
  | 'hymn-complete'
  | 'scale-walker'
  | 'metronome-steady'
  | 'thousand-notes'
  | 'comeback'

export interface Badge {
  id: BadgeId
  name: string
  description: string
  /** What the learner did, written so it reads as an achievement, not a task. */
  earnedHint: string
}

export interface StreakState {
  /** Consecutive days with at least one completed take. */
  current: number
  longest: number
  /** ISO date of the most recent day with practice. */
  lastPracticeDate: string | null
  /**
   * Missed days the streak can absorb. Earned back weekly.
   * Streaks motivate; a streak that can be destroyed by one bad week mostly
   * produces guilt and then abandonment, so this one bends before it breaks.
   */
  freezes: number
  /** ISO date freezes were last replenished. */
  freezesRefreshedOn: string | null
}

export interface LearnerProfile {
  schemaVersion: number
  createdAt: string
  xp: number
  streak: StreakState
  badges: BadgeId[]
  /** Minutes of practice the learner is aiming for each day. */
  dailyGoalMinutes: number
  /** Measured input latency in milliseconds, from calibration. */
  inputLatencyMs: number
  /** Audio input device the learner selected, if the browser will remember it. */
  preferredDeviceId: string | null
}

export interface ProgressSnapshot {
  profile: LearnerProfile
  exercises: Record<string, ExerciseProgress>
  /** Most recent attempts first. Trimmed to a bounded length. */
  history: Attempt[]
}
