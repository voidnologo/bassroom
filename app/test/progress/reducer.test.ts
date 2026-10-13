import { describe, expect, it } from 'vitest'
import {
  HISTORY_LIMIT,
  actualTiming,
  applyAttempt,
  buildDailyPlan,
  createExerciseProgress,
  createSnapshot,
  minutesPracticedOn,
  progressFor,
  retentionScore,
  selfEstimateAccuracy,
  type AttemptInput,
} from '../../src/progress/reducer'
import { addDays } from '../../src/progress/srs'
import type { PerformanceScore } from '../../src/engine/judge'
import type { Exercise } from '../../src/music/types'
import type { ProgressSnapshot } from '../../src/progress/types'
import { exercise } from '../../src/content/exerciseBuilder'
import { note } from '../../src/content/authoring'

const DAY_ONE = new Date('2026-03-02T19:00:00')

const pulse: Exercise = exercise({
  id: 'test-pulse',
  title: 'Pulse',
  instructions: 'Play four quarter notes on the open A string in time.',
  skills: ['quarter-notes'],
  notes: [note('A0', 0, 1), note('A0', 1, 1), note('A0', 2, 1), note('A0', 3, 1)],
  targetBpm: 100,
  floorBpm: 50,
})

const shuttle: Exercise = exercise({
  id: 'test-shuttle',
  title: 'Shuttle',
  instructions: 'Move between the third and fifth frets of the A string.',
  skills: ['position-shifts'],
  notes: [note('A3', 0, 1), note('A5', 1, 1)],
  targetBpm: 90,
  floorBpm: 50,
})

function score(overall: number, overrides: Partial<PerformanceScore> = {}): PerformanceScore {
  return {
    pitchAccuracy: overall / 100,
    timingAccuracy: overall / 100,
    meanTimingErrorMs: 0,
    timingSpreadMs: 20,
    extraNotes: 0,
    missedNotes: 0,
    wrongPitchNotes: 0,
    totalTargets: 4,
    overall,
    ...overrides,
  }
}

function input(overrides: Partial<AttemptInput> = {}): AttemptInput {
  return {
    exercise: pulse,
    score: score(95),
    bpm: 100,
    durationSeconds: 30,
    scaleExerciseIds: [],
    now: DAY_ONE,
    ...overrides,
  }
}

/** Apply a run of takes in sequence and keep the final snapshot. */
function run(overridesList: Array<Partial<AttemptInput>>): ProgressSnapshot {
  return overridesList.reduce(
    (snapshot, overrides) => applyAttempt(snapshot, input(overrides)).snapshot,
    createSnapshot(DAY_ONE),
  )
}

describe('createSnapshot', () => {
  it('stamps the schema version so old records stay readable', () => {
    expect(createSnapshot(DAY_ONE).profile.schemaVersion).toBeGreaterThanOrEqual(1)
  })

  it('starts with no XP, no badges, and no history', () => {
    const snapshot = createSnapshot(DAY_ONE)
    expect(snapshot.profile.xp).toBe(0)
    expect(snapshot.profile.badges).toEqual([])
    expect(snapshot.history).toEqual([])
  })

  it('sets a daily goal short enough to actually meet', () => {
    expect(createSnapshot(DAY_ONE).profile.dailyGoalMinutes).toBeLessThanOrEqual(20)
  })
})

describe('progressFor', () => {
  it('invents a starting record for an exercise never attempted', () => {
    expect(progressFor(createSnapshot(DAY_ONE), pulse, DAY_ONE).attempts).toBe(0)
  })

  it('starts the ladder at the floor tempo, not the target', () => {
    expect(createExerciseProgress(pulse, DAY_ONE).ladder.currentBpm).toBe(pulse.floorBpm)
  })
})

describe('applyAttempt', () => {
  it('records the take in history', () => {
    expect(applyAttempt(createSnapshot(DAY_ONE), input()).snapshot.history).toHaveLength(1)
  })

  it('puts the most recent take first', () => {
    const snapshot = run([{ exercise: pulse }, { exercise: shuttle }])
    expect(snapshot.history[0].exerciseId).toBe('test-shuttle')
  })

  it('awards XP', () => {
    expect(applyAttempt(createSnapshot(DAY_ONE), input()).snapshot.profile.xp).toBeGreaterThan(0)
  })

  it('counts the attempt against the exercise', () => {
    const snapshot = run([{}, {}, {}])
    expect(snapshot.exercises['test-pulse'].attempts).toBe(3)
  })

  it('keeps the best result rather than the latest', () => {
    const snapshot = run([{ score: score(98) }, { score: score(30), bpm: 50 }])
    expect(snapshot.exercises['test-pulse'].bestScore).toBe(98)
    expect(snapshot.exercises['test-pulse'].bestBpm).toBe(100)
  })

  it('awards three stars for a clean take at full tempo', () => {
    expect(applyAttempt(createSnapshot(DAY_ONE), input({ score: score(97) })).stars).toBe(3)
  })

  it('awards no stars for a take that fell apart', () => {
    expect(applyAttempt(createSnapshot(DAY_ONE), input({ score: score(20), bpm: 50 })).stars).toBe(
      0,
    )
  })

  it('moves the tempo ladder', () => {
    const result = applyAttempt(createSnapshot(DAY_ONE), input({ score: score(30) }))
    expect(result.ladder.change).toBeDefined()
  })

  it('schedules the exercise for review', () => {
    const result = applyAttempt(createSnapshot(DAY_ONE), input())
    expect(result.snapshot.exercises['test-pulse'].review.dueOn > '2026-03-02').toBe(true)
  })

  it('starts the practice streak', () => {
    expect(applyAttempt(createSnapshot(DAY_ONE), input()).streakOutcome).toBe('started')
  })

  it('does not count a second take on the same day as a second day', () => {
    const first = applyAttempt(createSnapshot(DAY_ONE), input())
    const second = applyAttempt(first.snapshot, input())
    expect(second.streakOutcome).toBe('already-counted')
    expect(second.snapshot.profile.streak.current).toBe(1)
  })

  it('pays the showing-up bonus only once a day', () => {
    const first = applyAttempt(createSnapshot(DAY_ONE), input())
    const second = applyAttempt(first.snapshot, input())
    expect(second.xp.firstOfDayBonus).toBe(0)
    expect(first.xp.firstOfDayBonus).toBeGreaterThan(0)
  })

  it('awards the first badge on the first take', () => {
    expect(applyAttempt(createSnapshot(DAY_ONE), input()).newBadges).toContain('first-note')
  })

  it('does not award the same badge twice', () => {
    const first = applyAttempt(createSnapshot(DAY_ONE), input())
    expect(applyAttempt(first.snapshot, input()).newBadges).not.toContain('first-note')
  })

  it('keeps earned badges on the profile', () => {
    expect(
      applyAttempt(createSnapshot(DAY_ONE), input()).snapshot.profile.badges.length,
    ).toBeGreaterThan(0)
  })

  it('leaves the snapshot it was given untouched', () => {
    const before = createSnapshot(DAY_ONE)
    applyAttempt(before, input())
    expect(before.history).toHaveLength(0)
    expect(before.profile.xp).toBe(0)
  })

  it('bounds the stored history', () => {
    let snapshot = createSnapshot(DAY_ONE)
    for (let take = 0; take < HISTORY_LIMIT + 20; take++) {
      snapshot = applyAttempt(snapshot, input()).snapshot
    }
    expect(snapshot.history).toHaveLength(HISTORY_LIMIT)
  })

  it('tracks several exercises independently', () => {
    const snapshot = run([{ exercise: pulse }, { exercise: shuttle }])
    expect(Object.keys(snapshot.exercises).sort()).toEqual(['test-pulse', 'test-shuttle'])
  })
})

describe('minutesPracticedOn', () => {
  it('sums the day the learner asked about', () => {
    const snapshot = run([{ durationSeconds: 90 }, { durationSeconds: 150 }])
    expect(minutesPracticedOn(snapshot.history, DAY_ONE)).toBe(4)
  })

  it('reports nothing for a day with no practice', () => {
    const snapshot = run([{ durationSeconds: 90 }])
    expect(minutesPracticedOn(snapshot.history, addDays(DAY_ONE, 1))).toBe(0)
  })

  it('counts a late evening session as that evening, not the next UTC day', () => {
    // Attempts are stored as UTC. West of Greenwich an 11pm session carries
    // tomorrow's UTC date, and most practice happens in the evening.
    const lateNight = new Date('2026-03-02T23:30:00')
    const snapshot = applyAttempt(
      createSnapshot(DAY_ONE),
      input({ now: lateNight, durationSeconds: 600 }),
    ).snapshot
    expect(minutesPracticedOn(snapshot.history, lateNight)).toBe(10)
    expect(minutesPracticedOn(snapshot.history, addDays(lateNight, 1))).toBe(0)
  })
})

describe('buildDailyPlan', () => {
  const catalogue = [pulse, shuttle]

  it('offers new exercises to someone who has never practised', () => {
    const plan = buildDailyPlan(createSnapshot(DAY_ONE), catalogue, DAY_ONE)
    expect(plan.every((item) => item.reason === 'next-up')).toBe(true)
  })

  it('puts a due review ahead of new material', () => {
    const snapshot = applyAttempt(createSnapshot(DAY_ONE), input()).snapshot
    const plan = buildDailyPlan(snapshot, catalogue, addDays(DAY_ONE, 5))
    expect(plan[0].exercise.id).toBe('test-pulse')
    expect(plan[0].reason).toBe('due-review')
  })

  it('orders reviews by how overdue they are', () => {
    let snapshot = applyAttempt(createSnapshot(DAY_ONE), input({ exercise: pulse })).snapshot
    snapshot = applyAttempt(
      snapshot,
      input({ exercise: shuttle, now: addDays(DAY_ONE, 3) }),
    ).snapshot
    const plan = buildDailyPlan(snapshot, catalogue, addDays(DAY_ONE, 10))
    const reviews = plan.filter((item) => item.reason === 'due-review')
    expect(reviews[0].overdueDays).toBeGreaterThanOrEqual(reviews[1].overdueDays)
  })

  it('does not list the same exercise twice', () => {
    const snapshot = applyAttempt(createSnapshot(DAY_ONE), input()).snapshot
    const plan = buildDailyPlan(snapshot, catalogue, addDays(DAY_ONE, 5))
    expect(new Set(plan.map((item) => item.exercise.id)).size).toBe(plan.length)
  })

  it('keeps the plan to a length someone will finish', () => {
    expect(buildDailyPlan(createSnapshot(DAY_ONE), catalogue, DAY_ONE, 1)).toHaveLength(1)
  })

  it('still offers something once everything is mastered', () => {
    let snapshot = createSnapshot(DAY_ONE)
    for (const item of catalogue) {
      snapshot = applyAttempt(snapshot, input({ exercise: item, score: score(99) })).snapshot
    }
    expect(buildDailyPlan(snapshot, catalogue, addDays(DAY_ONE, 30)).length).toBeGreaterThan(0)
  })
})

describe('probes and self-estimation', () => {
  it('records an ordinary take as guided practice, not a probe', () => {
    expect(applyAttempt(createSnapshot(DAY_ONE), input()).attempt.isProbe).toBe(false)
  })

  it('marks a take played with the feedback off as a probe', () => {
    expect(applyAttempt(createSnapshot(DAY_ONE), input({ isProbe: true })).attempt.isProbe).toBe(
      true,
    )
  })

  it('reports nothing for retention until a probe has been played', () => {
    const snapshot = run([{}, {}, {}])
    expect(retentionScore(snapshot.history, DAY_ONE)).toBeNull()
  })

  it('reports retention from probe takes only', () => {
    // The guided take scores 95 and the probe scores 60; 60 is the honest number.
    let snapshot = applyAttempt(createSnapshot(DAY_ONE), input({ score: score(95) })).snapshot
    snapshot = applyAttempt(snapshot, input({ isProbe: true, score: score(60) })).snapshot
    expect(retentionScore(snapshot.history, DAY_ONE)).toBe(60)
  })

  it('ignores probes older than the window', () => {
    const snapshot = applyAttempt(createSnapshot(DAY_ONE), input({ isProbe: true })).snapshot
    expect(retentionScore(snapshot.history, addDays(DAY_ONE, 40))).toBeNull()
  })

  it('scores a correct self-estimate as correct', () => {
    const dragging = score(80, { meanTimingErrorMs: 80 })
    const result = applyAttempt(
      createSnapshot(DAY_ONE),
      input({ score: dragging, selfEstimate: 'behind' }),
    )
    expect(result.attempt.estimateWasRight).toBe(true)
  })

  it('scores a wrong self-estimate as wrong', () => {
    const dragging = score(80, { meanTimingErrorMs: 80 })
    const result = applyAttempt(
      createSnapshot(DAY_ONE),
      input({ score: dragging, selfEstimate: 'ahead' }),
    )
    expect(result.attempt.estimateWasRight).toBe(false)
  })

  it('treats a small timing error as on the beat', () => {
    const tight = score(95, { meanTimingErrorMs: 10 })
    expect(actualTiming(tight)).toBe('on-it')
  })

  it('treats a large positive error as behind', () => {
    expect(actualTiming(score(70, { meanTimingErrorMs: 90 }))).toBe('behind')
  })

  it('treats a large negative error as ahead', () => {
    expect(actualTiming(score(70, { meanTimingErrorMs: -90 }))).toBe('ahead')
  })

  it('records nothing about an estimate that was not made', () => {
    expect(applyAttempt(createSnapshot(DAY_ONE), input()).attempt.estimateWasRight).toBeNull()
  })

  it('withholds an estimate-accuracy figure until there is enough to report', () => {
    const snapshot = run([{ selfEstimate: 'on-it' }, { selfEstimate: 'on-it' }])
    expect(selfEstimateAccuracy(snapshot.history)).toBeNull()
  })

  it('reports how often the learner reads their own timing correctly', () => {
    const snapshot = run(Array(6).fill({ selfEstimate: 'on-it' as const }))
    expect(selfEstimateAccuracy(snapshot.history)).toBe(1)
  })
})
