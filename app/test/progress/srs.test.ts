import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EASE,
  MAXIMUM_INTERVAL_DAYS,
  MINIMUM_EASE,
  addDays,
  createReviewState,
  daysBetween,
  isDue,
  isSuccess,
  scheduleNextReview,
  toIsoDate,
} from '../../src/progress/srs'
import type { Star } from '../../src/engine/tempoLadder'
import type { ReviewState } from '../../src/progress/types'

const DAY_ONE = new Date('2026-03-02T10:00:00')

/** Run a run of takes through the scheduler, a day apart, and keep the state. */
function practise(starSequence: Star[], from = DAY_ONE): { state: ReviewState; day: Date } {
  let state = createReviewState(from)
  let day = from
  for (const stars of starSequence) {
    state = scheduleNextReview(state, stars, day)
    day = addDays(day, state.intervalDays)
  }
  return { state, day }
}

describe('createReviewState', () => {
  it('makes a new exercise due immediately', () => {
    expect(isDue(createReviewState(DAY_ONE), DAY_ONE)).toBe(true)
  })

  it('starts at the default ease', () => {
    expect(createReviewState(DAY_ONE).ease).toBe(DEFAULT_EASE)
  })
})

describe('isSuccess', () => {
  it('treats a starless take as a failure', () => {
    expect(isSuccess(0)).toBe(false)
  })

  it.each([1, 2, 3] as Star[])('treats %i stars as a success', (stars) => {
    expect(isSuccess(stars)).toBe(true)
  })
})

describe('scheduleNextReview', () => {
  it('brings a newly learned exercise back the next day', () => {
    expect(practise([2]).state.intervalDays).toBe(1)
  })

  it('does not stretch the interval on the second success', () => {
    // Played correctly twice is not learned, however well it went.
    expect(practise([3, 3]).state.intervalDays).toBe(3)
  })

  it('grows the interval from the third success onward', () => {
    expect(practise([2, 2, 2]).state.intervalDays).toBeGreaterThan(3)
  })

  it('never schedules further out than three weeks', () => {
    expect(practise(Array<Star>(20).fill(3)).state.intervalDays).toBeLessThanOrEqual(
      MAXIMUM_INTERVAL_DAYS,
    )
  })

  it('counts consecutive successes', () => {
    expect(practise([1, 2, 3]).state.streak).toBe(3)
  })

  it('resets the success streak on a failure', () => {
    const learned = practise([2, 2, 2])
    expect(scheduleNextReview(learned.state, 0, learned.day).streak).toBe(0)
  })

  it('halves the interval on a lapse rather than resetting it', () => {
    // Losing a physical skill is gradual, and sending a near-miss back to day
    // one is the kind of punishment that makes people stop practising.
    const learned = practise([3, 3, 3, 3])
    const lapsed = scheduleNextReview(learned.state, 0, learned.day)
    expect(lapsed.intervalDays).toBeLessThan(learned.state.intervalDays)
    expect(lapsed.intervalDays).toBeGreaterThanOrEqual(1)
  })

  it('counts lapses', () => {
    const learned = practise([2, 2, 2])
    expect(scheduleNextReview(learned.state, 0, learned.day).lapses).toBe(1)
  })

  it('lowers ease when a take barely passes', () => {
    expect(practise([1]).state.ease).toBeLessThan(DEFAULT_EASE)
  })

  it('raises ease for a clean take at tempo', () => {
    expect(practise([3]).state.ease).toBeGreaterThan(DEFAULT_EASE)
  })

  it('never drops ease below the floor', () => {
    expect(practise(Array<Star>(30).fill(1)).state.ease).toBeGreaterThanOrEqual(MINIMUM_EASE)
  })

  it('schedules the next review the interval away from today', () => {
    const state = scheduleNextReview(createReviewState(DAY_ONE), 2, DAY_ONE)
    expect(state.dueOn).toBe(toIsoDate(addDays(DAY_ONE, 1)))
  })

  it('brings a hard exercise back sooner than an easy one', () => {
    const hard = practise([1, 1, 1, 1])
    const easy = practise([3, 3, 3, 3])
    expect(hard.state.intervalDays).toBeLessThan(easy.state.intervalDays)
  })
})

describe('isDue', () => {
  const state = scheduleNextReview(createReviewState(DAY_ONE), 2, DAY_ONE)

  it('is not due before its date', () => {
    expect(isDue(state, DAY_ONE)).toBe(false)
  })

  it('is due on its date', () => {
    expect(isDue(state, addDays(DAY_ONE, 1))).toBe(true)
  })

  it('stays due after its date', () => {
    expect(isDue(state, addDays(DAY_ONE, 10))).toBe(true)
  })
})

describe('date helpers', () => {
  it('formats a date without a time', () => {
    expect(toIsoDate(new Date('2026-03-02T23:30:00'))).toBe('2026-03-02')
  })

  it('counts days between a date string and a date', () => {
    expect(daysBetween('2026-03-02', new Date('2026-03-09T08:00:00'))).toBe(7)
  })

  it('counts zero for the same day at a different hour', () => {
    expect(daysBetween('2026-03-02', new Date('2026-03-02T23:59:00'))).toBe(0)
  })

  it('crosses a month boundary correctly', () => {
    expect(toIsoDate(addDays(new Date('2026-03-31T10:00:00'), 1))).toBe('2026-04-01')
  })
})
