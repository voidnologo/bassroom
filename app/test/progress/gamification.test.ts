import { describe, expect, it } from 'vitest'
import {
  BADGES,
  badgeById,
  createStreak,
  levelFor,
  newlyEarnedBadges,
  recordPractice,
  starsLabel,
  xpForAttempt,
  xpForLevel,
  xpIntoLevel,
} from '../../src/progress/gamification'
import { addDays } from '../../src/progress/srs'
import type { BadgeContext } from '../../src/progress/gamification'
import type { Attempt, LearnerProfile } from '../../src/progress/types'
import type { Star } from '../../src/engine/tempoLadder'

const DAY_ONE = new Date('2026-03-02T19:00:00')

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    exerciseId: 'eighth-note-pulse',
    completedAt: DAY_ONE.toISOString(),
    bpm: 60,
    targetBpm: 100,
    stars: 1,
    durationSeconds: 30,
    abandoned: false,
    isProbe: false,
    selfEstimate: null,
    estimateWasRight: null,
    score: {
      pitchAccuracy: 0.9,
      timingAccuracy: 0.8,
      meanTimingErrorMs: 5,
      timingSpreadMs: 40,
      extraNotes: 0,
      missedNotes: 0,
      wrongPitchNotes: 1,
      totalTargets: 16,
      overall: 85,
    },
    ...overrides,
  }
}

function profile(overrides: Partial<LearnerProfile> = {}): LearnerProfile {
  return {
    schemaVersion: 1,
    createdAt: DAY_ONE.toISOString(),
    diagnosticsEnabled: false,
    xp: 0,
    streak: createStreak(),
    badges: [],
    dailyGoalMinutes: 15,
    inputLatencyMs: 0,
    preferredDeviceId: null,
    ...overrides,
  }
}

function context(overrides: Partial<BadgeContext> = {}): BadgeContext {
  return {
    profile: profile(),
    history: [],
    notesPlayed: 0,
    starredExerciseIds: new Set(),
    masteredExerciseIds: new Set(),
    scaleExerciseIds: [],
    daysSinceLastPractice: null,
    ...overrides,
  }
}

describe('levels', () => {
  it('starts everyone at level one', () => {
    expect(levelFor(0)).toBe(1)
  })

  it('reaches level two within a first session', () => {
    expect(levelFor(100)).toBeGreaterThanOrEqual(2)
  })

  it('never goes backward as XP grows', () => {
    let previous = 0
    for (let xp = 0; xp < 10000; xp += 137) {
      const level = levelFor(xp)
      expect(level).toBeGreaterThanOrEqual(previous)
      previous = level
    }
  })

  it('widens the gap between later levels', () => {
    const early = xpForLevel(3) - xpForLevel(2)
    const late = xpForLevel(12) - xpForLevel(11)
    expect(late).toBeGreaterThan(early)
  })

  it('agrees with its own threshold table', () => {
    for (const level of [1, 2, 5, 10, 20]) expect(levelFor(xpForLevel(level))).toBe(level)
  })

  it('reports progress through the current level', () => {
    const progress = xpIntoLevel(xpForLevel(4) + 10)
    expect(progress.into).toBe(10)
    expect(progress.fraction).toBeGreaterThan(0)
    expect(progress.fraction).toBeLessThan(1)
  })

  it('treats negative XP as zero rather than failing', () => {
    expect(levelFor(-50)).toBe(1)
  })
})

describe('xpForAttempt', () => {
  it('awards something for finishing a take at all', () => {
    expect(
      xpForAttempt(attempt({ stars: 0, score: { ...attempt().score, overall: 0 } }), false).total,
    ).toBeGreaterThan(0)
  })

  it('rewards a more accurate take more', () => {
    const sloppy = xpForAttempt(
      attempt({ score: { ...attempt().score, overall: 40 } }),
      false,
    ).total
    const clean = xpForAttempt(attempt({ score: { ...attempt().score, overall: 95 } }), false).total
    expect(clean).toBeGreaterThan(sloppy)
  })

  it('rewards playing closer to performance tempo', () => {
    const slow = xpForAttempt(attempt({ bpm: 50 }), false).total
    const fast = xpForAttempt(attempt({ bpm: 100 }), false).total
    expect(fast).toBeGreaterThan(slow)
  })

  it('does not reward exceeding the target tempo', () => {
    const atTempo = xpForAttempt(attempt({ bpm: 100 }), false).tempoBonus
    const over = xpForAttempt(attempt({ bpm: 200 }), false).tempoBonus
    expect(over).toBe(atTempo)
  })

  it('rewards stars most of all', () => {
    const one = xpForAttempt(attempt({ stars: 1 }), false).total
    const three = xpForAttempt(attempt({ stars: 3 }), false).total
    expect(three - one).toBeGreaterThan(30)
  })

  it('pays a bonus for showing up', () => {
    const later = xpForAttempt(attempt(), false).total
    const first = xpForAttempt(attempt(), true).total
    expect(first).toBeGreaterThan(later)
  })

  it('adds up to its own total', () => {
    const breakdown = xpForAttempt(attempt({ stars: 2 }), true)
    expect(breakdown.total).toBe(
      breakdown.base +
        breakdown.scoreBonus +
        breakdown.tempoBonus +
        breakdown.starBonus +
        breakdown.firstOfDayBonus,
    )
  })

  it('does not let grinding at the floor tempo out-earn playing well', () => {
    const grind = xpForAttempt(
      attempt({ bpm: 40, stars: 0, score: { ...attempt().score, overall: 30 } }),
      false,
    ).total
    const good = xpForAttempt(
      attempt({ bpm: 100, stars: 3, score: { ...attempt().score, overall: 97 } }),
      false,
    ).total
    expect(good).toBeGreaterThan(grind * 3)
  })
})

describe('recordPractice', () => {
  it('starts a streak on the first day', () => {
    const update = recordPractice(createStreak(), DAY_ONE)
    expect(update.outcome).toBe('started')
    expect(update.streak.current).toBe(1)
  })

  it('counts only once per day', () => {
    const first = recordPractice(createStreak(), DAY_ONE)
    const second = recordPractice(first.streak, new Date('2026-03-02T22:00:00'))
    expect(second.outcome).toBe('already-counted')
    expect(second.streak.current).toBe(1)
  })

  it('extends on consecutive days', () => {
    let streak = createStreak()
    for (let day = 0; day < 5; day++) streak = recordPractice(streak, addDays(DAY_ONE, day)).streak
    expect(streak.current).toBe(5)
  })

  it('spends a freeze to survive one missed day', () => {
    const first = recordPractice(createStreak(), DAY_ONE)
    const after = recordPractice(first.streak, addDays(DAY_ONE, 2))
    expect(after.outcome).toBe('saved-by-freeze')
    expect(after.streak.current).toBe(2)
    expect(after.streak.freezes).toBe(1)
  })

  it('resets once the freezes run out', () => {
    const first = recordPractice(createStreak(), DAY_ONE)
    const after = recordPractice(first.streak, addDays(DAY_ONE, 10))
    expect(after.outcome).toBe('reset')
    expect(after.streak.current).toBe(1)
  })

  it('keeps the longest streak through a reset', () => {
    let streak = createStreak()
    for (let day = 0; day < 9; day++) streak = recordPractice(streak, addDays(DAY_ONE, day)).streak
    const broken = recordPractice(streak, addDays(DAY_ONE, 40)).streak
    expect(broken.current).toBe(1)
    expect(broken.longest).toBe(9)
  })

  it('earns a freeze back after a week', () => {
    const start = recordPractice(createStreak(), DAY_ONE)
    const spent = recordPractice(start.streak, addDays(DAY_ONE, 2))
    const later = recordPractice(spent.streak, addDays(DAY_ONE, 10))
    expect(later.streak.freezes).toBeGreaterThanOrEqual(spent.streak.freezes)
  })

  it('never stockpiles more than two freezes', () => {
    let streak = recordPractice(createStreak(), DAY_ONE).streak
    for (let week = 1; week <= 10; week++) {
      streak = recordPractice(streak, addDays(DAY_ONE, week * 7)).streak
    }
    expect(streak.freezes).toBeLessThanOrEqual(2)
  })
})

describe('badges', () => {
  it('describes every badge it can award', () => {
    for (const badge of BADGES) {
      expect(badge.name.length).toBeGreaterThan(0)
      expect(badge.description.length).toBeGreaterThan(10)
    }
  })

  it('gives every badge a unique id', () => {
    expect(new Set(BADGES.map((badge) => badge.id)).size).toBe(BADGES.length)
  })

  it('finds a badge by id', () => {
    expect(badgeById('first-note')?.name).toBe('First note')
  })

  it('awards the first badge once a note has actually been played', () => {
    expect(newlyEarnedBadges(context({ history: [attempt()], notesPlayed: 1 }))).toContain(
      'first-note',
    )
  })

  it('withholds it from a take the detector heard nothing in', () => {
    expect(newlyEarnedBadges(context({ history: [attempt()], notesPlayed: 0 }))).not.toContain(
      'first-note',
    )
  })

  it('awards nothing before anything has happened', () => {
    expect(newlyEarnedBadges(context())).toEqual([])
  })

  it('does not re-award a badge already held', () => {
    const held = context({ history: [attempt()], profile: profile({ badges: ['first-note'] }) })
    expect(newlyEarnedBadges(held)).not.toContain('first-note')
  })

  it('awards the tempo badge only at the target tempo', () => {
    expect(
      newlyEarnedBadges(context({ history: [attempt({ bpm: 99, targetBpm: 100 })] })),
    ).not.toContain('full-tempo')
    expect(
      newlyEarnedBadges(context({ history: [attempt({ bpm: 100, targetBpm: 100 })] })),
    ).toContain('full-tempo')
  })

  it('awards the week badge at seven days', () => {
    const streak = { ...createStreak(), current: 7 }
    expect(newlyEarnedBadges(context({ profile: profile({ streak }) }))).toContain('week-streak')
  })

  it('rewards coming back after a break', () => {
    const returning = context({ history: [attempt(), attempt()], daysSinceLastPractice: 12 })
    expect(newlyEarnedBadges(returning)).toContain('comeback')
  })

  it('does not award the comeback badge on a first ever take', () => {
    expect(newlyEarnedBadges(context({ history: [attempt()] }))).not.toContain('comeback')
  })

  it('awards the scale badge only when every scale is starred', () => {
    const partial = context({
      scaleExerciseIds: ['major-scale-f', 'minor-scale-c'],
      starredExerciseIds: new Set(['major-scale-f']),
    })
    expect(newlyEarnedBadges(partial)).not.toContain('scale-walker')

    const complete = context({
      scaleExerciseIds: ['major-scale-f', 'minor-scale-c'],
      starredExerciseIds: new Set(['major-scale-f', 'minor-scale-c']),
    })
    expect(newlyEarnedBadges(complete)).toContain('scale-walker')
  })

  it('does not award the scale badge when there are no scales to play', () => {
    expect(newlyEarnedBadges(context({ scaleExerciseIds: [] }))).not.toContain('scale-walker')
  })

  it('awards the steadiness badge for tight timing over a real take', () => {
    const steady = attempt({ score: { ...attempt().score, timingSpreadMs: 20, totalTargets: 16 } })
    expect(newlyEarnedBadges(context({ history: [steady] }))).toContain('metronome-steady')
  })

  it('does not award steadiness from a two-note take', () => {
    const tiny = attempt({ score: { ...attempt().score, timingSpreadMs: 5, totalTargets: 2 } })
    expect(newlyEarnedBadges(context({ history: [tiny] }))).not.toContain('metronome-steady')
  })

  it('awards the song badges for mastering the full versions', () => {
    const done = context({
      masteredExerciseIds: new Set(['song-angel-full', 'song-this-is-the-christ-full']),
    })
    const earned = newlyEarnedBadges(done)
    expect(earned).toContain('angel-complete')
    expect(earned).toContain('hymn-complete')
  })
})

describe('starsLabel', () => {
  it.each([
    { stars: 0, label: '☆☆☆' },
    { stars: 1, label: '★☆☆' },
    { stars: 3, label: '★★★' },
  ])('renders $stars stars', ({ stars, label }) => {
    expect(starsLabel(stars as Star)).toBe(label)
  })
})
