import { describe, expect, it } from 'vitest'
import {
  judgePerformance,
  notesPlayed,
  nothingWasPlayed,
  scorePerformance,
  windowsForTempo,
  type PlayedNote,
} from '../../src/engine/judge'
import type { TargetNote } from '../../src/music/types'
import { parseNote } from '../../src/music/notes'

const C2 = parseNote('C2')
const D2 = parseNote('D2')

function target(startBeat: number, midi = C2): TargetNote {
  return { midi, startBeat, durationBeats: 1 }
}

function played(beat: number, midi: number | null = C2): PlayedNote {
  return { beat, midi, cents: 0, level: 0.5 }
}

/** Four quarter notes, the shape of nearly every early exercise. */
const FOUR_QUARTERS = [target(0), target(1), target(2), target(3)]

describe('windowsForTempo', () => {
  it('widens the windows as the tempo slows', () => {
    expect(windowsForTempo(60).goodMs).toBeGreaterThan(windowsForTempo(160).goodMs)
  })

  it('never lets the perfect window collapse at fast tempos', () => {
    expect(windowsForTempo(240).perfectMs).toBeGreaterThanOrEqual(55)
  })

  it('never lets the perfect window become meaningless at slow tempos', () => {
    expect(windowsForTempo(30).perfectMs).toBeLessThanOrEqual(120)
  })

  it('keeps the windows ordered', () => {
    const windows = windowsForTempo(90)
    expect(windows.perfectMs).toBeLessThan(windows.goodMs)
    expect(windows.goodMs).toBeLessThan(windows.matchMs)
  })
})

describe('judgePerformance', () => {
  it('calls a note on the beat at the right pitch perfect', () => {
    const judgments = judgePerformance([target(0)], [played(0)], 60)
    expect(judgments[0].verdict).toBe('perfect')
  })

  it('calls a slightly late note good', () => {
    // 60 bpm: the perfect window is 120 ms, good runs to 240 ms.
    const judgments = judgePerformance([target(0)], [played(0.2)], 60)
    expect(judgments[0].verdict).toBe('good')
  })

  it('calls a clearly late note late', () => {
    const judgments = judgePerformance([target(0)], [played(0.3)], 60)
    expect(judgments[0].verdict).toBe('late')
  })

  it('calls a clearly early note early', () => {
    const judgments = judgePerformance([target(1)], [played(0.7)], 60)
    expect(judgments[0].verdict).toBe('early')
  })

  it('calls the right rhythm on the wrong note wrong-pitch', () => {
    const judgments = judgePerformance([target(0, C2)], [played(0, D2)], 60)
    expect(judgments[0].verdict).toBe('wrong-pitch')
    expect(judgments[0].semitoneError).toBe(2)
  })

  it('separates a pluck it could not name from one that was the wrong note', () => {
    const judgments = judgePerformance([target(0)], [played(0, null)], 60)
    expect(judgments[0].verdict).toBe('unpitched')
  })

  it('judges the timing of a pluck it could not name, because that part is known', () => {
    const onBeat = judgePerformance([target(0)], [played(0, null)], 60)
    const late = judgePerformance([target(1)], [played(0.7, null)], 60)
    expect(onBeat[0].inTime).toBe(true)
    expect(late[0].inTime).toBe(false)
  })

  it('reports a target with nothing near it as missed', () => {
    const judgments = judgePerformance(FOUR_QUARTERS, [played(0), played(1), played(3)], 60)
    expect(judgments.filter((j) => j.verdict === 'missed')).toHaveLength(1)
    expect(judgments.find((j) => j.verdict === 'missed')!.target!.startBeat).toBe(2)
  })

  it('reports a note with no target near it as extra', () => {
    const judgments = judgePerformance([target(0)], [played(0), played(2)], 60)
    expect(judgments.filter((j) => j.verdict === 'extra')).toHaveLength(1)
  })

  it('does not let one note satisfy two targets', () => {
    const judgments = judgePerformance([target(0), target(0.1)], [played(0.05)], 60)
    expect(judgments.filter((j) => j.verdict === 'missed')).toHaveLength(1)
  })

  it('surfaces a dropped note instead of shifting everything after it', () => {
    // The whole reason for greedy nearest-match: a global alignment would
    // explain this away as four notes played early, hiding the dropped one.
    const played2 = [played(1), played(2), played(3)]
    const judgments = judgePerformance(FOUR_QUARTERS, played2, 60)
    expect(judgments.filter((j) => j.verdict === 'missed')).toHaveLength(1)
    expect(judgments.filter((j) => j.verdict === 'perfect')).toHaveLength(3)
  })

  it('returns judgments in playing order', () => {
    const judgments = judgePerformance(
      FOUR_QUARTERS,
      [played(3), played(0), played(1), played(2)],
      60,
    )
    const beats = judgments.map((j) => j.target?.startBeat ?? j.played!.beat)
    expect(beats).toEqual([...beats].sort((a, b) => a - b))
  })

  it('reports signed timing error in milliseconds', () => {
    const judgments = judgePerformance([target(0)], [played(0.1)], 60)
    expect(judgments[0].timingErrorMs).toBeCloseTo(100, 6)
  })

  it('handles a take where nothing was played', () => {
    const judgments = judgePerformance(FOUR_QUARTERS, [], 60)
    expect(judgments.every((j) => j.verdict === 'missed')).toBe(true)
  })
})

describe('scorePerformance', () => {
  it('gives a flawless take full marks', () => {
    const score = scorePerformance(
      judgePerformance(FOUR_QUARTERS, [played(0), played(1), played(2), played(3)], 60),
    )
    expect(score.overall).toBe(100)
    expect(score.pitchAccuracy).toBe(1)
    expect(score.timingAccuracy).toBe(1)
  })

  it('gives a silent take zero', () => {
    expect(scorePerformance(judgePerformance(FOUR_QUARTERS, [], 60)).overall).toBe(0)
  })

  it('scores right notes at the wrong time above wrong notes at the right time', () => {
    const lateButCorrect = scorePerformance(
      judgePerformance(
        FOUR_QUARTERS,
        [0, 1, 2, 3].map((b) => played(b + 0.35)),
        60,
      ),
    )
    const onTimeButWrong = scorePerformance(
      judgePerformance(
        FOUR_QUARTERS,
        [0, 1, 2, 3].map((b) => played(b, D2)),
        60,
      ),
    )
    expect(lateButCorrect.overall).toBeGreaterThan(onTimeButWrong.overall)
  })

  it('penalises extra notes so flailing cannot score well', () => {
    const clean = scorePerformance(
      judgePerformance(
        FOUR_QUARTERS,
        [0, 1, 2, 3].map((b) => played(b)),
        60,
      ),
    )
    const flailing = scorePerformance(
      judgePerformance(
        FOUR_QUARTERS,
        [0, 0.4, 1, 1.4, 2, 2.4, 3, 3.4].map((b) => played(b)),
        60,
      ),
    )
    expect(flailing.overall).toBeLessThan(clean.overall)
  })

  it('reports dragging as a positive mean timing error', () => {
    const score = scorePerformance(
      judgePerformance(
        FOUR_QUARTERS,
        [0, 1, 2, 3].map((b) => played(b + 0.1)),
        60,
      ),
    )
    expect(score.meanTimingErrorMs).toBeGreaterThan(0)
  })

  it('reports rushing as a negative mean timing error', () => {
    const score = scorePerformance(
      judgePerformance(
        FOUR_QUARTERS,
        [0, 1, 2, 3].map((b) => played(b - 0.1)),
        60,
      ),
    )
    expect(score.meanTimingErrorMs).toBeLessThan(0)
  })

  it('separates a consistent offset from inconsistent timing', () => {
    // Uniformly late is a latency or anticipation problem; scattered is a
    // steadiness problem. The spread is what tells them apart.
    const uniform = scorePerformance(
      judgePerformance(
        FOUR_QUARTERS,
        [0, 1, 2, 3].map((b) => played(b + 0.1)),
        60,
      ),
    )
    const scattered = scorePerformance(
      judgePerformance(
        FOUR_QUARTERS,
        [0.1, 0.9, 1.25, 2.85].map((b) => played(b)),
        60,
      ),
    )
    expect(uniform.timingSpreadMs).toBeLessThan(scattered.timingSpreadMs)
  })

  it('counts each failure kind separately', () => {
    const judgments = judgePerformance(FOUR_QUARTERS, [played(0), played(1, D2), played(9)], 60)
    const score = scorePerformance(judgments)
    expect(score.wrongPitchNotes).toBe(1)
    expect(score.missedNotes).toBe(2)
    expect(score.extraNotes).toBe(1)
    expect(score.totalTargets).toBe(4)
  })

  it('never returns a negative overall score', () => {
    const judgments = judgePerformance(
      [target(0)],
      Array.from({ length: 20 }, (_, i) => played(i * 3)),
      60,
    )
    expect(scorePerformance(judgments).overall).toBeGreaterThanOrEqual(0)
  })
})

describe('notesPlayed', () => {
  it('counts a matched target and a note no target claimed', () => {
    const judgments = judgePerformance(FOUR_QUARTERS, [played(0), played(9)], 60)
    expect(notesPlayed(scorePerformance(judgments))).toBe(2)
  })

  it('counts nothing when the player stayed silent', () => {
    expect(notesPlayed(scorePerformance(judgePerformance(FOUR_QUARTERS, [], 60)))).toBe(0)
  })
})

describe('nothingWasPlayed', () => {
  it('is true for a take the player sat through in silence', () => {
    expect(nothingWasPlayed(scorePerformance(judgePerformance(FOUR_QUARTERS, [], 60)))).toBe(true)
  })

  it('is false when the player played a wrong note, which is still playing', () => {
    const judgments = judgePerformance(FOUR_QUARTERS, [played(9)], 60)
    expect(nothingWasPlayed(scorePerformance(judgments))).toBe(false)
  })
})

describe('scoring a pluck the app could not name', () => {
  /**
   * The app has said it does not know which note was played, so it must not
   * claim the note was wrong. It earns no pitch credit either: the only honest
   * treatment is to leave it out of the pitch figure entirely.
   */
  const twoNamedTwoNot = () =>
    judgePerformance(FOUR_QUARTERS, [played(0), played(1), played(2, null), played(3, null)], 60)

  it('leaves it out of pitch accuracy rather than counting it wrong', () => {
    expect(scorePerformance(twoNamedTwoNot()).pitchAccuracy).toBe(1)
  })

  it('counts it against nothing, where a wrong note does count against pitch', () => {
    const wrongNotes = judgePerformance(
      FOUR_QUARTERS,
      [played(0), played(1), played(2, D2), played(3, D2)],
      60,
    )
    expect(scorePerformance(wrongNotes).pitchAccuracy).toBe(0.5)
  })

  it('reports how many it could not name, so the cause is visible', () => {
    expect(scorePerformance(twoNamedTwoNot()).unnamedNotes).toBe(2)
  })

  it('still credits the timing of every note that was heard', () => {
    expect(scorePerformance(twoNamedTwoNot()).timingAccuracy).toBe(1)
  })

  it('scores a take it could name nothing in on timing alone', () => {
    const noneNamed = judgePerformance(
      FOUR_QUARTERS,
      FOUR_QUARTERS.map((_, index) => played(index, null)),
      60,
    )
    const score = scorePerformance(noneNamed)
    expect(score.timingAccuracy).toBe(1)
    expect(score.overall).toBe(100)
  })
})
