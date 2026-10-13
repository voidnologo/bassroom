import { describe, expect, it } from 'vitest'
import {
  DEMOTION_SCORE,
  PROMOTION_SCORE,
  TAKES_TO_PROMOTE,
  advanceLadder,
  createLadder,
  starRequirementText,
  starsFor,
  type LadderState,
} from '../../src/engine/tempoLadder'
import type { PerformanceScore } from '../../src/engine/judge'

function score(overall: number): PerformanceScore {
  return {
    pitchAccuracy: overall / 100,
    timingAccuracy: overall / 100,
    meanTimingErrorMs: 0,
    timingSpreadMs: 0,
    extraNotes: 0,
    missedNotes: 0,
    wrongPitchNotes: 0,
    totalTargets: 8,
    overall,
  }
}

/** Run a sequence of take scores through the ladder and return the end state. */
function takes(state: LadderState, scores: number[]): LadderState {
  return scores.reduce((current, value) => advanceLadder(current, score(value)).next, state)
}

describe('createLadder', () => {
  it('starts the learner at the floor tempo, not the target', () => {
    expect(createLadder(107, 60).currentBpm).toBe(60)
  })

  it('remembers the target to work toward', () => {
    expect(createLadder(107, 60).targetBpm).toBe(107)
  })
})

describe('advanceLadder', () => {
  it('holds tempo after a single clean take', () => {
    const outcome = advanceLadder(createLadder(107, 60), score(PROMOTION_SCORE))
    expect(outcome.change).toBe('held')
    expect(outcome.next.currentBpm).toBe(60)
  })

  it('raises tempo after the required run of clean takes', () => {
    const start = createLadder(107, 60)
    const end = takes(start, Array(TAKES_TO_PROMOTE).fill(PROMOTION_SCORE))
    expect(end.currentBpm).toBeGreaterThan(60)
  })

  it('raises tempo in steps small enough not to be felt', () => {
    const end = takes(createLadder(107, 60), Array(TAKES_TO_PROMOTE).fill(100))
    expect(end.currentBpm - 60).toBeLessThanOrEqual(Math.ceil(60 * 0.1))
  })

  it('resets the clean-take run after a weak take', () => {
    const afterOne = advanceLadder(createLadder(107, 60), score(PROMOTION_SCORE)).next
    expect(advanceLadder(afterOne, score(80)).next.cleanTakes).toBe(0)
  })

  it('drops tempo immediately on a poor take', () => {
    const state = { ...createLadder(107, 60), currentBpm: 90 }
    const outcome = advanceLadder(state, score(DEMOTION_SCORE - 1))
    expect(outcome.change).toBe('demoted')
    expect(outcome.next.currentBpm).toBeLessThan(90)
  })

  it('never drops below the floor tempo', () => {
    const end = takes(createLadder(107, 60), Array(10).fill(10))
    expect(end.currentBpm).toBe(60)
  })

  it('never climbs past the target tempo', () => {
    const end = takes(createLadder(107, 60), Array(60).fill(100))
    expect(end.currentBpm).toBe(107)
  })

  it('says so when a clean take happens at full tempo', () => {
    const atTarget = { ...createLadder(107, 60), currentBpm: 107, cleanTakes: TAKES_TO_PROMOTE - 1 }
    expect(advanceLadder(atTarget, score(100)).message).toMatch(/full tempo/)
  })

  it('records the fastest tempo cleared', () => {
    const end = takes(createLadder(200, 60), [100, 100, 100, 100, 20])
    expect(end.bestClearedBpm).toBeGreaterThan(60)
  })

  it('does not credit a tempo that was never cleared', () => {
    expect(takes(createLadder(200, 60), [50, 40]).bestClearedBpm).toBe(0)
  })

  it('always explains what it did', () => {
    for (const value of [10, 70, 95, 100]) {
      expect(advanceLadder(createLadder(107, 60), score(value)).message.length).toBeGreaterThan(0)
    }
  })
})

describe('starsFor', () => {
  it('awards three stars only for a clean take at full tempo', () => {
    expect(starsFor(score(96), 107, 107)).toBe(3)
  })

  it('withholds the third star when the tempo is short of target', () => {
    expect(starsFor(score(96), 90, 107)).toBeLessThan(3)
  })

  it('withholds the third star when accuracy is short', () => {
    expect(starsFor(score(90), 107, 107)).toBeLessThan(3)
  })

  it('awards two stars for a good take near tempo', () => {
    expect(starsFor(score(90), 95, 107)).toBe(2)
  })

  it('awards one star for a workable take at slow tempo', () => {
    expect(starsFor(score(78), 70, 107)).toBe(1)
  })

  it('awards nothing for a take that fell apart', () => {
    expect(starsFor(score(40), 60, 107)).toBe(0)
  })

  it('describes what each star needs', () => {
    for (const star of [0, 1, 2, 3] as const) {
      expect(starRequirementText(star).length).toBeGreaterThan(0)
    }
  })
})
