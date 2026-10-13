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
  /** Best tempo at which a take scored well enough to count. */
  bestClearedBpm: number
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
    bestClearedBpm: 0,
  }
}

export interface LadderOutcome {
  next: LadderState
  change: 'promoted' | 'held' | 'demoted'
  message: string
}

export function advanceLadder(state: LadderState, score: PerformanceScore): LadderOutcome {
  const cleared = score.overall >= PROMOTION_SCORE
  const bestClearedBpm = cleared ? Math.max(state.bestClearedBpm, state.currentBpm) : state.bestClearedBpm

  if (score.overall < DEMOTION_SCORE) {
    const nextBpm = Math.max(state.floorBpm, Math.round(state.currentBpm * 0.9))
    return {
      next: { ...state, currentBpm: nextBpm, cleanTakes: 0, bestClearedBpm },
      change: nextBpm === state.currentBpm ? 'held' : 'demoted',
      message:
        nextBpm === state.currentBpm
          ? 'Staying here. This tempo is still the right place to work.'
          : `Dropping to ${nextBpm} bpm. Accuracy first, speed second.`,
    }
  }

  if (!cleared) {
    return {
      next: { ...state, cleanTakes: 0, bestClearedBpm },
      change: 'held',
      message: 'Close. One more clean take at this tempo.',
    }
  }

  const cleanTakes = state.cleanTakes + 1
  if (cleanTakes < TAKES_TO_PROMOTE) {
    return {
      next: { ...state, cleanTakes, bestClearedBpm },
      change: 'held',
      message: `Clean. ${TAKES_TO_PROMOTE - cleanTakes} more like that and the tempo goes up.`,
    }
  }

  if (state.currentBpm >= state.targetBpm) {
    return {
      next: { ...state, cleanTakes: 0, bestClearedBpm },
      change: 'held',
      message: 'That is full tempo, played clean. This one is yours.',
    }
  }

  const nextBpm = Math.min(state.targetBpm, nextRung(state.currentBpm))
  return {
    next: { ...state, currentBpm: nextBpm, cleanTakes: 0, bestClearedBpm },
    change: 'promoted',
    message: `Up to ${nextBpm} bpm.`,
  }
}

/**
 * Roughly 8% steps, rounded to a whole bpm and never smaller than 2 bpm, so the
 * jump is small enough that the hands barely notice it.
 */
function nextRung(bpm: number): number {
  return bpm + Math.max(2, Math.round(bpm * 0.08))
}

export function starsFor(score: PerformanceScore, bpm: number, targetBpm: number): Star {
  const ratio = bpm / targetBpm
  if (score.overall >= 95 && ratio >= 1) return 3
  if (score.overall >= 88 && ratio >= 0.85) return 2
  if (score.overall >= 75 && ratio >= 0.6) return 1
  return 0
}

export function starRequirementText(star: Star): string {
  switch (star) {
    case 1:
      return '75% at 60% of target tempo'
    case 2:
      return '88% at 85% of target tempo'
    case 3:
      return '95% at full tempo'
    default:
      return 'Complete a take'
  }
}
