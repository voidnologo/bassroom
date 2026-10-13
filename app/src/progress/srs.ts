import type { Star } from '../engine/tempoLadder'
import type { ReviewState } from './types'

/**
 * Review scheduling for physical skills.
 *
 * SM-2 in shape, with three changes for the fact that this schedules playing
 * rather than remembering:
 *
 *   - Intervals are capped at three weeks. A fact can sit for months; a hand
 *     pattern cannot, and the cost of refreshing one is a minute of playing.
 *   - The first two intervals are fixed at one and three days regardless of how
 *     well the take went, because a pattern played once correctly is not learned.
 *   - A lapse halves the interval rather than resetting it. Losing a physical
 *     skill is gradual, and sending a near-miss back to day one is the kind of
 *     punishment that makes people stop opening the app.
 */

export const MINIMUM_EASE = 1.3
export const DEFAULT_EASE = 2.3
export const MAXIMUM_INTERVAL_DAYS = 21
const FIRST_INTERVAL_DAYS = 1
const SECOND_INTERVAL_DAYS = 3

export function createReviewState(today: Date): ReviewState {
  return {
    ease: DEFAULT_EASE,
    intervalDays: 0,
    dueOn: toIsoDate(today),
    streak: 0,
    lapses: 0,
  }
}

/** A take counts as a success once it has earned at least one star. */
export function isSuccess(stars: Star): boolean {
  return stars >= 1
}

export function scheduleNextReview(state: ReviewState, stars: Star, today: Date): ReviewState {
  return isSuccess(stars) ? advance(state, stars, today) : lapse(state, today)
}

function advance(state: ReviewState, stars: Star, today: Date): ReviewState {
  const streak = state.streak + 1
  const ease = adjustEase(state.ease, stars)
  const relearning = state.lapses > 0 && state.intervalDays > FIRST_INTERVAL_DAYS
  const intervalDays = nextInterval(streak, state.intervalDays, ease, relearning)
  return {
    ease,
    intervalDays,
    streak,
    lapses: state.lapses,
    dueOn: toIsoDate(addDays(today, intervalDays)),
  }
}

function lapse(state: ReviewState, today: Date): ReviewState {
  const intervalDays = Math.max(FIRST_INTERVAL_DAYS, Math.floor(state.intervalDays / 2))
  return {
    ease: Math.max(MINIMUM_EASE, state.ease - 0.2),
    intervalDays,
    streak: 0,
    lapses: state.lapses + 1,
    dueOn: toIsoDate(addDays(today, intervalDays)),
  }
}

/**
 * `relearning` is what makes a lapse a setback rather than a reset. Without it
 * the halved interval survives exactly one review and the next success drops
 * back to day one - which is the full reset this module says it avoids.
 */
function nextInterval(
  streak: number,
  previousDays: number,
  ease: number,
  relearning: boolean,
): number {
  if (streak === 1) return relearning ? previousDays : FIRST_INTERVAL_DAYS
  if (streak === 2 && !relearning) return SECOND_INTERVAL_DAYS
  return Math.min(MAXIMUM_INTERVAL_DAYS, Math.round(previousDays * ease))
}

/** Three stars earns a longer leash; one star keeps the exercise coming back. */
function adjustEase(ease: number, stars: Star): number {
  const delta = { 0: -0.2, 1: -0.1, 2: 0, 3: 0.1 }[stars] ?? 0
  return clamp(ease + delta, MINIMUM_EASE, 2.8)
}

export function isDue(state: ReviewState, today: Date): boolean {
  return state.dueOn <= toIsoDate(today)
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function daysBetween(fromIsoDate: string, toDate: Date): number {
  const from = new Date(`${fromIsoDate}T00:00:00`)
  const to = new Date(`${toIsoDate(toDate)}T00:00:00`)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
