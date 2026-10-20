import { isTimed } from '../music/meter'
import type { PracticeMode } from '../music/types'
import type { PerformanceScore } from './judge'

export type Star = 0 | 1 | 2 | 3

/**
 * The tempo ladder: practise slow enough to be accurate, speed up only when
 * accuracy holds, and drop back the moment it does not. This is the single
 * mechanic most responsible for a passage becoming playable at speed, and it is
 * the one learners skip when left to their own judgment, so the app drives it.
 */

export interface LadderState {
  currentBpm: number
  targetBpm: number
  floorBpm: number
  /** Consecutive clean takes at the current tempo. */
  cleanTakes: number
}

export const PROMOTION_SCORE = 90
export const DEMOTION_SCORE = 65
export const TAKES_TO_PROMOTE = 2

export function createLadder(targetBpm: number, floorBpm: number): LadderState {
  return {
    currentBpm: floorBpm,
    targetBpm,
    floorBpm,
    cleanTakes: 0,
  }
}

export interface LadderOutcome {
  next: LadderState
  message: string
}

export function advanceLadder(state: LadderState, score: PerformanceScore): LadderOutcome {
  const cleared = score.overall >= PROMOTION_SCORE

  if (score.overall < DEMOTION_SCORE) {
    const nextBpm = Math.max(state.floorBpm, Math.round(state.currentBpm * 0.9))
    return {
      next: { ...state, currentBpm: nextBpm, cleanTakes: 0 },
      message:
        nextBpm === state.currentBpm
          ? 'Staying here. This tempo is still the right place to work.'
          : `Dropping to ${nextBpm} bpm. Accuracy first, speed second.`,
    }
  }

  if (!cleared) {
    return {
      next: { ...state, cleanTakes: 0 },
      message: 'Close. One more clean take at this tempo.',
    }
  }

  const cleanTakes = state.cleanTakes + 1
  if (cleanTakes < TAKES_TO_PROMOTE) {
    return {
      next: { ...state, cleanTakes },
      message: `Clean. ${TAKES_TO_PROMOTE - cleanTakes} more like that and the tempo goes up.`,
    }
  }

  if (state.currentBpm >= state.targetBpm) {
    return {
      next: { ...state, cleanTakes: 0 },
      message: 'That is full tempo, played clean. This one is yours.',
    }
  }

  const nextBpm = Math.min(state.targetBpm, nextRungBpm(state.currentBpm))
  return {
    next: { ...state, currentBpm: nextBpm, cleanTakes: 0 },
    message: `Up to ${nextBpm} bpm.`,
  }
}

/**
 * Roughly 8% steps, rounded to a whole bpm and never smaller than 2 bpm, so the
 * jump is small enough that the hands barely notice it.
 */
export function nextRungBpm(bpm: number): number {
  return bpm + Math.max(2, Math.round(bpm * 0.08))
}

export interface StarThresholds {
  targetBpm: number
  /** The slowest tempo the exercise is meant to be practised at. */
  floorBpm: number
  mode: PracticeMode
}

/**
 * The first star is earned at the exercise's own floor tempo, not at a fixed
 * fraction of its target.
 *
 * A fixed fraction and the floor are the same decision written twice, and they
 * disagreed: the floor defaulted to 55% of target while one star needed 60%, so
 * a beginner's first take - the ladder starts them at the floor - scored zero
 * stars however well they played it. That reads as a failure everywhere
 * downstream: no star means a review lapse, and the lesson never unlocks.
 */
export function starsFor(score: PerformanceScore, bpm: number, thresholds: StarThresholds): Star {
  const earned = starsForAccuracy(score)
  if (!isTimed(thresholds)) return earned
  const { targetBpm, floorBpm } = thresholds
  const ratio = bpm / targetBpm
  if (earned === 3 && ratio >= 1) return 3
  if (earned >= 2 && ratio >= 0.85) return 2
  if (earned >= 1 && bpm >= floorBpm) return 1
  return 0
}

/**
 * What the accuracy alone is worth, before any tempo is asked of it. An untimed
 * drill stops here: there is no tempo to earn, so gating on one would cap it at
 * a single star however well it is played.
 */
function starsForAccuracy(score: PerformanceScore): Star {
  if (score.overall >= ACCURACY_FOR_THREE) return 3
  if (score.overall >= ACCURACY_FOR_TWO) return 2
  if (score.overall >= ACCURACY_FOR_ONE) return 1
  return 0
}

const ACCURACY_FOR_ONE = 75
const ACCURACY_FOR_TWO = 88
const ACCURACY_FOR_THREE = 95

export function starRequirementText(star: Star, thresholds: Pick<StarThresholds, 'mode'>): string {
  if (!isTimed(thresholds)) return ACCURACY_REQUIREMENTS[star]
  switch (star) {
    case 1:
      return `${ACCURACY_FOR_ONE}% accurate at the starting tempo`
    case 2:
      return `${ACCURACY_FOR_TWO}% at 85% of target tempo`
    case 3:
      return `${ACCURACY_FOR_THREE}% at full tempo`
    default:
      return 'Complete a take'
  }
}

const ACCURACY_REQUIREMENTS: Record<Star, string> = {
  0: 'Complete a take',
  1: `${ACCURACY_FOR_ONE}% of the notes right`,
  2: `${ACCURACY_FOR_TWO}% of the notes right`,
  3: `${ACCURACY_FOR_THREE}% of the notes right`,
}
