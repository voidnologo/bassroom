import type { Star } from '../engine/tempoLadder'
import type { Attempt, Badge, BadgeId, LearnerProfile, StreakState } from './types'
import { addDays, daysBetween, toIsoDate } from './srs'

/**
 * Experience, levels, streaks, and badges.
 *
 * The design brief for this layer: make returning tomorrow easier, and never
 * make missing a day feel like a loss worth quitting over. Everything here is
 * additive. Nothing is taken away, nothing expires, and the streak bends twice
 * before it breaks.
 */

const BASE_XP_PER_TAKE = 10
const MAX_SCORE_BONUS = 25
const MAX_TEMPO_BONUS = 15
const STAR_BONUS = [0, 10, 25, 50] as const
const FIRST_TAKE_OF_DAY_BONUS = 20
const MAX_FREEZES = 2
const DAYS_PER_FREEZE = 7

/**
 * Levels widen as they go, and the first few arrive inside the first session,
 * which is when a beginner most needs evidence that anything is happening.
 */
export function levelFor(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 25)) + 1
}

export function xpForLevel(level: number): number {
  return (level - 1) ** 2 * 25
}

export function xpIntoLevel(xp: number): { into: number; needed: number; fraction: number } {
  const level = levelFor(xp)
  const floor = xpForLevel(level)
  const ceiling = xpForLevel(level + 1)
  const needed = ceiling - floor
  const into = xp - floor
  return { into, needed, fraction: needed === 0 ? 1 : into / needed }
}

export interface XpBreakdown {
  base: number
  scoreBonus: number
  tempoBonus: number
  starBonus: number
  firstOfDayBonus: number
  total: number
}

/**
 * XP rewards the three things worth rewarding, in order: that a take happened
 * at all, how accurate it was, and how close to performance tempo it was. Mere
 * repetition at the floor tempo earns the base amount and no more.
 */
/** No tempo means no tempo bonus: there is no performance speed to approach. */
function tempoRatioOf(attempt: Attempt): number {
  if (attempt.bpm === null || attempt.targetBpm === null) return 0
  return Math.min(1, attempt.bpm / attempt.targetBpm)
}

export function xpForAttempt(attempt: Attempt, isFirstOfDay: boolean): XpBreakdown {
  const scoreBonus = Math.round((attempt.score.overall / 100) * MAX_SCORE_BONUS)
  const tempoBonus = Math.round(tempoRatioOf(attempt) * MAX_TEMPO_BONUS)
  const starBonus = STAR_BONUS[attempt.stars]
  const firstOfDayBonus = isFirstOfDay ? FIRST_TAKE_OF_DAY_BONUS : 0

  return {
    base: BASE_XP_PER_TAKE,
    scoreBonus,
    tempoBonus,
    starBonus,
    firstOfDayBonus,
    total: BASE_XP_PER_TAKE + scoreBonus + tempoBonus + starBonus + firstOfDayBonus,
  }
}

export function createStreak(): StreakState {
  return {
    current: 0,
    longest: 0,
    lastPracticeDate: null,
    freezes: MAX_FREEZES,
    freezesRefreshedOn: null,
  }
}

export type StreakOutcome =
  'started' | 'continued' | 'already-counted' | 'saved-by-freeze' | 'reset'

export interface StreakUpdate {
  streak: StreakState
  outcome: StreakOutcome
}

/** Fold a day of practice into the streak. Call once per completed take. */
export function recordPractice(streak: StreakState, today: Date): StreakUpdate {
  const refreshed = replenishFreezes(streak, today)
  const todayIso = toIsoDate(today)

  if (refreshed.lastPracticeDate === null) {
    return { streak: extend(refreshed, 1, todayIso), outcome: 'started' }
  }
  const gap = daysBetween(refreshed.lastPracticeDate, today)
  if (gap <= 0) return { streak: refreshed, outcome: 'already-counted' }
  if (gap === 1) {
    return { streak: extend(refreshed, refreshed.current + 1, todayIso), outcome: 'continued' }
  }
  return absorbOrReset(refreshed, gap, todayIso)
}

/**
 * One freeze covers one missed day. A longer absence is not a failure state,
 * just a fresh start, and the longest streak is kept either way.
 */
function absorbOrReset(streak: StreakState, gap: number, todayIso: string): StreakUpdate {
  const missed = gap - 1
  if (missed <= streak.freezes) {
    const extended = extend(
      { ...streak, freezes: streak.freezes - missed },
      streak.current + 1,
      todayIso,
    )
    return { streak: extended, outcome: 'saved-by-freeze' }
  }
  return { streak: extend(streak, 1, todayIso), outcome: 'reset' }
}

function extend(streak: StreakState, current: number, todayIso: string): StreakState {
  return {
    ...streak,
    current,
    longest: Math.max(streak.longest, current),
    lastPracticeDate: todayIso,
  }
}

function replenishFreezes(streak: StreakState, today: Date): StreakState {
  const since = streak.freezesRefreshedOn
  if (since === null) return { ...streak, freezesRefreshedOn: toIsoDate(today) }
  const elapsed = daysBetween(since, today)
  const earned = Math.floor(elapsed / DAYS_PER_FREEZE)
  if (earned <= 0) return streak
  return {
    ...streak,
    freezes: Math.min(MAX_FREEZES, streak.freezes + earned),
    // Advance by what was spent, not to today, so the remaining days still count
    // toward the next freeze.
    freezesRefreshedOn: toIsoDate(addDays(new Date(`${since}T00:00:00`), earned * DAYS_PER_FREEZE)),
  }
}

export const BADGES: Badge[] = [
  {
    id: 'first-note',
    name: 'First note',
    description: 'Finish your first take.',
    earnedHint: 'You played something.',
  },
  {
    id: 'first-star',
    name: 'First star',
    description: 'Earn a star on any exercise.',
    earnedHint: 'Accurate enough to count.',
  },
  {
    id: 'three-stars',
    name: 'Clean at tempo',
    description: 'Earn three stars on any exercise.',
    earnedHint: 'Full tempo, played clean.',
  },
  {
    id: 'full-tempo',
    name: 'Up to speed',
    description: "Reach an exercise's target tempo.",
    earnedHint: 'The ladder topped out.',
  },
  {
    id: 'week-streak',
    name: 'Seven days',
    description: 'Practise seven days running.',
    earnedHint: 'A week without a gap.',
  },
  {
    id: 'month-streak',
    name: 'Thirty days',
    description: 'Practise thirty days running.',
    earnedHint: 'A month without a gap.',
  },
  {
    id: 'comeback',
    name: 'Back at it',
    description: 'Return after a break of a week or more.',
    earnedHint: 'Coming back is the hard part.',
  },
  {
    id: 'scale-walker',
    name: 'Scale walker',
    description: 'Earn a star on every scale drill.',
    earnedHint: 'Every scale, played cleanly.',
  },
  {
    id: 'metronome-steady',
    name: 'Steady',
    description: 'Finish a take with timing spread under 30 ms.',
    earnedHint: 'Not just in time - evenly in time.',
  },
  {
    id: 'thousand-notes',
    name: 'A thousand notes',
    description: 'Play a thousand notes in graded takes.',
    earnedHint: 'The hands have done the work.',
  },
  {
    id: 'angel-complete',
    name: 'Angel',
    description: 'Three stars on the full Angel riff.',
    earnedHint: 'Six minutes of C and D, earned.',
  },
  {
    id: 'hymn-complete',
    name: 'This Is the Christ',
    description: 'Three stars on the complete hymn.',
    earnedHint: 'Verse, chorus and the key change.',
  },
]

const BADGES_BY_ID = new Map(BADGES.map((badge) => [badge.id, badge]))

export function badgeById(id: BadgeId): Badge | undefined {
  return BADGES_BY_ID.get(id)
}

export interface BadgeContext {
  profile: LearnerProfile
  history: Attempt[]
  /** Total notes asked for across every graded take. */
  notesPlayed: number
  /** Exercise ids that have reached at least one star. */
  starredExerciseIds: Set<string>
  /** Exercise ids that have reached three stars. */
  masteredExerciseIds: Set<string>
  /** Exercise ids tagged as scale drills. */
  scaleExerciseIds: string[]
  /** Days since the previous practice day, or null on the first ever take. */
  daysSinceLastPractice: number | null
}

type BadgeRule = (context: BadgeContext) => boolean

const RULES: Record<BadgeId, BadgeRule> = {
  'first-note': (context) => context.notesPlayed >= 1,
  'first-star': (context) => context.starredExerciseIds.size >= 1,
  'three-stars': (context) => context.masteredExerciseIds.size >= 1,
  'full-tempo': (context) =>
    context.history.some(
      (item) => item.bpm !== null && item.targetBpm !== null && item.bpm >= item.targetBpm,
    ),
  'week-streak': (context) => context.profile.streak.current >= 7,
  'month-streak': (context) => context.profile.streak.current >= 30,
  comeback: (context) =>
    context.history.length > 1 &&
    context.daysSinceLastPractice !== null &&
    context.daysSinceLastPractice >= 7,
  'scale-walker': (context) =>
    context.scaleExerciseIds.length > 0 &&
    context.scaleExerciseIds.every((id) => context.starredExerciseIds.has(id)),
  // Counted over notes that were actually matched, not notes offered: the
  // spread is a standard deviation over matched notes only, so a take where one
  // note landed and seven were missed has a spread of zero.
  'metronome-steady': (context) =>
    context.history.some(
      (item) =>
        item.score.totalTargets - item.score.missedNotes >= 8 &&
        item.score.overall >= 70 &&
        item.score.timingSpreadMs !== null &&
        item.score.timingSpreadMs < 30,
    ),
  'thousand-notes': (context) => context.notesPlayed >= 1000,
  'angel-complete': (context) => context.masteredExerciseIds.has('song-angel-full'),
  'hymn-complete': (context) => context.masteredExerciseIds.has('song-this-is-the-christ-full'),
}

/** Badges newly earned by this context, excluding ones already held. */
export function newlyEarnedBadges(context: BadgeContext): BadgeId[] {
  const held = new Set(context.profile.badges)
  return (Object.keys(RULES) as BadgeId[]).filter((id) => !held.has(id) && RULES[id](context))
}

export function starsLabel(stars: Star): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars)
}
