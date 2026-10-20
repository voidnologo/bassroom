import {
  advanceLadder,
  createLadder,
  starsFor,
  type LadderOutcome,
  type Star,
} from '../engine/tempoLadder'
import { notesPlayed, nothingWasPlayed } from '../engine/judge'
import type { PerformanceScore } from '../engine/judge'
import { isTimed } from '../music/meter'
import type { Exercise } from '../music/types'
import { newlyEarnedBadges, recordPractice, xpForAttempt, type XpBreakdown } from './gamification'
import { createReviewState, daysBetween, isReviewDue, scheduleNextReview, toIsoDate } from './srs'
import {
  PROGRESS_SCHEMA_VERSION,
  type Attempt,
  type BadgeId,
  type ExerciseProgress,
  type LearnerProfile,
  type ProgressSnapshot,
  type SelfEstimate,
} from './types'

/**
 * Pure state transitions for a learner's progress.
 *
 * Kept separate from the store so that every rule about XP, streaks, badges,
 * mastery and scheduling can be tested without a browser, a database, or a
 * React tree. The store does nothing but hold the result and persist it.
 */

/** Attempts retained in full. Older ones are summarised into the exercise record. */
export const HISTORY_LIMIT = 500

export function createSnapshot(now: Date): ProgressSnapshot {
  return {
    profile: {
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      createdAt: now.toISOString(),
      xp: 0,
      streak: {
        current: 0,
        longest: 0,
        lastPracticeDate: null,
        freezes: 2,
        freezesRefreshedOn: null,
      },
      badges: [],
      dailyGoalMinutes: 15,
      inputLatencyMs: 0,
      diagnosticsEnabled: false,
      preferredDeviceId: null,
    },
    exercises: {},
    history: [],
  }
}

export function createExerciseProgress(exercise: Exercise, now: Date): ExerciseProgress {
  return {
    exerciseId: exercise.id,
    attempts: 0,
    bestStars: 0,
    bestScore: 0,
    bestBpm: 0,
    ladder: isTimed(exercise) ? createLadder(exercise.targetBpm, exercise.floorBpm) : null,
    review: createReviewState(now),
    lastPracticedAt: null,
  }
}

export function progressFor(
  snapshot: ProgressSnapshot,
  exercise: Exercise,
  now: Date,
): ExerciseProgress {
  return snapshot.exercises[exercise.id] ?? createExerciseProgress(exercise, now)
}

export interface AttemptResult {
  snapshot: ProgressSnapshot
  attempt: Attempt
  stars: Star
  xp: XpBreakdown
  newBadges: BadgeId[]
  /** Null for an exercise with no ladder, which has nothing to report about one. */
  ladder: LadderOutcome | null
}

export interface AttemptInput {
  exercise: Exercise
  score: PerformanceScore
  bpm: number | null
  durationSeconds: number
  /** Exercise ids that count as scale drills, for the scale badge. */
  scaleExerciseIds: string[]
  now: Date
  /** True when the take was played with the feedback display off. */
  isProbe?: boolean
  /**
   * True when the player stopped the take early. Recorded for the history but
   * excluded from XP, the streak, the tempo ladder and the review schedule: a
   * take that was abandoned two seconds in is not evidence of anything, and
   * treating it as one both corrupts the schedule and makes the streak
   * maintainable with a daily two-second tap.
   */
  abandoned?: boolean
  selfEstimate?: SelfEstimate | null
}

function buildAttempt(input: AttemptInput, stars: Star, unplayed: boolean): Attempt {
  const selfEstimate = input.selfEstimate ?? null
  // A guess can only be marked against a measurement, and an unplayed take has
  // none worth marking against.
  const measured = unplayed ? null : actualTiming(input.score)
  return {
    exerciseId: input.exercise.id,
    completedAt: input.now.toISOString(),
    bpm: input.bpm,
    targetBpm: isTimed(input.exercise) ? input.exercise.targetBpm : null,
    score: input.score,
    stars,
    durationSeconds: input.durationSeconds,
    abandoned: input.abandoned ?? false,
    isProbe: input.isProbe ?? false,
    selfEstimate,
    estimateWasRight: selfEstimate !== null && measured !== null ? selfEstimate === measured : null,
  }
}

/**
 * Fold one completed take into the learner's state: mastery, tempo ladder,
 * review schedule, XP, streak, and any badges it earns.
 */
export function applyAttempt(snapshot: ProgressSnapshot, input: AttemptInput): AttemptResult {
  const { exercise, score, bpm, now } = input
  // A take the detector heard nothing in is no more evidence than an abandoned
  // one, so it is recorded and then excluded from everything that reads as progress.
  const unplayed = nothingWasPlayed(score)
  const discounted = (input.abandoned ?? false) || unplayed
  const stars = starsFor(score, bpm, exercise)
  const attempt = buildAttempt(input, stars, unplayed)

  const previous = progressFor(snapshot, exercise, now)
  const ladder = ladderAfter(previous, score, discounted)
  const updatedExercise: ExerciseProgress = {
    ...previous,
    attempts: previous.attempts + 1,
    bestStars: Math.max(previous.bestStars, stars) as Star,
    bestScore: Math.max(previous.bestScore, score.overall),
    bestBpm: Math.max(previous.bestBpm, bpm ?? 0),
    ladder: ladder?.next ?? null,
    review: discounted ? previous.review : scheduleNextReview(previous.review, stars, now),
    lastPracticedAt: attempt.completedAt,
  }

  const daysSinceLastPractice = gapBeforeToday(snapshot.profile, now)
  const streakUpdate = discounted
    ? { streak: snapshot.profile.streak, outcome: 'already-counted' as const }
    : recordPractice(snapshot.profile.streak, now)
  const xp = discounted ? NO_XP : xpForAttempt(attempt, streakUpdate.outcome !== 'already-counted')

  const history = [attempt, ...snapshot.history].slice(0, HISTORY_LIMIT)
  const exercises = { ...snapshot.exercises, [exercise.id]: updatedExercise }
  const withProgress: ProgressSnapshot = {
    profile: {
      ...snapshot.profile,
      xp: snapshot.profile.xp + xp.total,
      streak: streakUpdate.streak,
    },
    exercises,
    history,
  }

  const newBadges = newlyEarnedBadges({
    profile: withProgress.profile,
    history,
    notesPlayed: countNotesPlayed(history),
    starredExerciseIds: idsAtLeast(exercises, 1),
    masteredExerciseIds: idsAtLeast(exercises, 3),
    scaleExerciseIds: input.scaleExerciseIds,
    daysSinceLastPractice,
  })

  return {
    snapshot: {
      ...withProgress,
      profile: { ...withProgress.profile, badges: [...withProgress.profile.badges, ...newBadges] },
    },
    attempt,
    stars,
    xp,
    newBadges,
    ladder,
  }
}

/**
 * What the measurement says, in the same three buckets the learner chose from.
 * The threshold is the point at which a player can perceive their own error.
 */
export function actualTiming(score: PerformanceScore): SelfEstimate | null {
  const PERCEPTIBLE_MS = 25
  const { meanTimingErrorMs } = score
  if (meanTimingErrorMs === null) return null
  if (meanTimingErrorMs > PERCEPTIBLE_MS) return 'behind'
  if (meanTimingErrorMs < -PERCEPTIBLE_MS) return 'ahead'
  return 'on-it'
}

const NO_XP: XpBreakdown = {
  base: 0,
  scoreBonus: 0,
  tempoBonus: 0,
  starBonus: 0,
  firstOfDayBonus: 0,
  total: 0,
}

/**
 * The ladder trades accuracy for tempo. An exercise with no tempo has none to
 * trade for and carries no ladder at all, and an abandoned take is no evidence
 * to move one with, so both leave this with nothing to report.
 */
function ladderAfter(
  previous: ExerciseProgress,
  score: PerformanceScore,
  discounted: boolean,
): LadderOutcome | null {
  const ladder = previous.ladder
  if (ladder === null) return null
  if (discounted)
    return { next: ladder, message: 'Stopped early. Nothing recorded against this one.' }
  return advanceLadder(ladder, score)
}

function gapBeforeToday(profile: LearnerProfile, now: Date): number | null {
  const last = profile.streak.lastPracticeDate
  return last === null ? null : daysBetween(last, now)
}

function countNotesPlayed(history: Attempt[]): number {
  return history.reduce((sum, item) => sum + notesPlayed(item.score), 0)
}

function idsAtLeast(exercises: Record<string, ExerciseProgress>, stars: Star): Set<string> {
  return new Set(
    Object.values(exercises)
      .filter((item) => item.bestStars >= stars)
      .map((item) => item.exerciseId),
  )
}

/**
 * Minutes of graded playing on a given day, in the learner's local time.
 *
 * `completedAt` is stored as UTC, so it cannot be compared by string: an
 * evening session west of Greenwich carries tomorrow's UTC date, which is
 * precisely when most practice happens.
 */
export function minutesPracticedOn(history: Attempt[], day: Date): number {
  const target = toIsoDate(day)
  const seconds = history
    .filter((item) => toIsoDate(new Date(item.completedAt)) === target)
    .reduce((sum, item) => sum + item.durationSeconds, 0)
  return Math.round(seconds / 60)
}

export interface DailyPlanItem {
  exercise: Exercise
  reason: 'due-review' | 'in-progress' | 'next-up'
  /** Days past its review date. Zero or negative for anything not overdue. */
  overdueDays: number
}

/**
 * What to practise today.
 *
 * Reviews come first and in order of how overdue they are, because a skill
 * sliding backward costs more than a new one gained. Then whatever is already
 * underway, then one new thing. Interleaving old and new work beats grinding
 * one exercise, and the learner should not have to decide this each day.
 */
export function buildDailyPlan(
  snapshot: ProgressSnapshot,
  available: Exercise[],
  now: Date,
  limit = 6,
): DailyPlanItem[] {
  const seen = new Set<string>()
  const plan: DailyPlanItem[] = []

  const take = (exercise: Exercise, reason: DailyPlanItem['reason'], overdueDays: number): void => {
    if (seen.has(exercise.id) || plan.length >= limit) return
    seen.add(exercise.id)
    plan.push({ exercise, reason, overdueDays })
  }

  const dueReviews = available
    .map((exercise) => ({ exercise, progress: snapshot.exercises[exercise.id] }))
    .filter((entry) => entry.progress !== undefined && isReviewDue(entry.progress.review, now))
    .map((entry) => ({ ...entry, overdueDays: daysBetween(entry.progress!.review.dueOn, now) }))
    .sort((a, b) => b.overdueDays - a.overdueDays)

  for (const entry of dueReviews) take(entry.exercise, 'due-review', entry.overdueDays)

  for (const exercise of available) {
    const progress = snapshot.exercises[exercise.id]
    if (progress && progress.bestStars < 3) take(exercise, 'in-progress', 0)
  }

  for (const exercise of available) {
    if (!snapshot.exercises[exercise.id]) take(exercise, 'next-up', 0)
  }

  return plan
}

/**
 * The retention figure to show as progress: recent probe takes only.
 *
 * Accuracy measured while the highway, the fretboard marker and the live note
 * readout are all helping is inflated by exactly the help being given. The
 * probe is what is left when that is taken away.
 */
export function retentionScore(history: Attempt[], now: Date, windowDays = 14): number | null {
  const since = now.getTime() - windowDays * 86_400_000
  const probes = history.filter(
    (item) => item.isProbe && new Date(item.completedAt).getTime() >= since,
  )
  if (probes.length === 0) return null
  return Math.round(probes.reduce((sum, item) => sum + item.score.overall, 0) / probes.length)
}

/** How often the learner's guess about their own timing matched the measurement. */
export function selfEstimateAccuracy(history: Attempt[]): number | null {
  const guessed = history.filter((item) => item.estimateWasRight !== null)
  if (guessed.length < 5) return null
  return guessed.filter((item) => item.estimateWasRight).length / guessed.length
}
