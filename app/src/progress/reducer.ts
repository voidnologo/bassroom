import {
  advanceLadder,
  createLadder,
  starsFor,
  type LadderOutcome,
  type Star,
} from '../engine/tempoLadder'
import type { PerformanceScore } from '../engine/judge'
import type { Exercise } from '../music/types'
import {
  newlyEarnedBadges,
  recordPractice,
  xpForAttempt,
  type StreakOutcome,
  type XpBreakdown,
} from './gamification'
import { createReviewState, daysBetween, isDue, scheduleNextReview, toIsoDate } from './srs'
import {
  PROGRESS_SCHEMA_VERSION,
  type Attempt,
  type BadgeId,
  type ExerciseProgress,
  type LearnerProfile,
  type ProgressSnapshot,
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
    ladder: createLadder(exercise.targetBpm, exercise.floorBpm),
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
  streakOutcome: StreakOutcome
  ladder: LadderOutcome
}

export interface AttemptInput {
  exercise: Exercise
  score: PerformanceScore
  bpm: number
  durationSeconds: number
  /** Exercise ids that count as scale drills, for the scale badge. */
  scaleExerciseIds: string[]
  now: Date
}

/**
 * Fold one completed take into the learner's state: mastery, tempo ladder,
 * review schedule, XP, streak, and any badges it earns.
 */
export function applyAttempt(snapshot: ProgressSnapshot, input: AttemptInput): AttemptResult {
  const { exercise, score, bpm, durationSeconds, now } = input
  const stars = starsFor(score, bpm, exercise.targetBpm)
  const attempt: Attempt = {
    exerciseId: exercise.id,
    completedAt: now.toISOString(),
    bpm,
    targetBpm: exercise.targetBpm,
    score,
    stars,
    durationSeconds,
  }

  const previous = progressFor(snapshot, exercise, now)
  const ladder = advanceLadder(previous.ladder, score)
  const updatedExercise: ExerciseProgress = {
    ...previous,
    attempts: previous.attempts + 1,
    bestStars: Math.max(previous.bestStars, stars) as Star,
    bestScore: Math.max(previous.bestScore, score.overall),
    bestBpm: Math.max(previous.bestBpm, bpm),
    ladder: ladder.next,
    review: scheduleNextReview(previous.review, stars, now),
    lastPracticedAt: attempt.completedAt,
  }

  const daysSinceLastPractice = gapBeforeToday(snapshot.profile, now)
  const streakUpdate = recordPractice(snapshot.profile.streak, now)
  const xp = xpForAttempt(attempt, streakUpdate.outcome !== 'already-counted')

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
    streakOutcome: streakUpdate.outcome,
    ladder,
  }
}

function gapBeforeToday(profile: LearnerProfile, now: Date): number | null {
  const last = profile.streak.lastPracticeDate
  return last === null ? null : daysBetween(last, now)
}

function countNotesPlayed(history: Attempt[]): number {
  return history.reduce((sum, item) => sum + item.score.totalTargets, 0)
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
    .filter((entry) => entry.progress !== undefined && isDue(entry.progress.review, now))
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
