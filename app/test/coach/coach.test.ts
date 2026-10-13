import { describe, expect, it } from 'vitest'
import { HeuristicCoach } from '../../src/coach/heuristic'
import { parseFeedback } from '../../src/coach/llm'
import { buildTelemetry, locate } from '../../src/coach/telemetry'
import {
  TELEMETRY_SCHEMA_VERSION,
  type CoachRequest,
  type TakeTelemetry,
} from '../../src/coach/types'
import { judgePerformance, type PlayedNote } from '../../src/engine/judge'
import { note } from '../../src/content/authoring'
import { exercise } from '../../src/content/exerciseBuilder'
import { parseNote } from '../../src/music/notes'
import type { Exercise } from '../../src/music/types'

const NOW = new Date('2026-03-02T19:00:00')

const eightNotes: Exercise = exercise({
  id: 'test-eight',
  title: 'Eight notes',
  instructions: 'Play eight quarter notes on the third fret of the A string.',
  skills: ['quarter-notes'],
  notes: Array.from({ length: 8 }, (_, index) => note('A3', index, 1)),
  targetBpm: 100,
  floorBpm: 50,
})

function played(beat: number, midi: number | null, extras: Partial<PlayedNote> = {}): PlayedNote {
  return { beat, midi, cents: 0, level: 0.5, ...extras }
}

/** Build a complete request from a list of what the learner actually played. */
function request(notes: PlayedNote[], bpm = 60, recentTakes: TakeTelemetry[] = []): CoachRequest {
  const judgments = judgePerformance(eightNotes.notes, notes, bpm)
  const telemetry = buildTelemetry({
    exercise: eightNotes,
    judgments,
    bpm,
    latencyCorrectionMs: 12,
    takeId: 'take-1',
    now: NOW,
    learner: {
      level: 2,
      totalAttempts: 10,
      attemptsOnThisExercise: 3,
      bestStarsOnThisExercise: 1,
      daysSinceFirstPractice: 5,
    },
  })
  return { telemetry, exercise: eightNotes, judgments, recentTakes }
}

/** A take of the given quality, used to build a history. */
function perfectTake(): PlayedNote[] {
  return Array.from({ length: 8 }, (_, index) => played(index, parseNote('C2')))
}

const coach = new HeuristicCoach()

describe('buildTelemetry', () => {
  it('stamps the schema version, so old records stay readable', () => {
    expect(request(perfectTake()).telemetry.schemaVersion).toBe(TELEMETRY_SCHEMA_VERSION)
  })

  it('records the latency correction that was applied', () => {
    expect(request(perfectTake()).telemetry.latencyCorrectionMs).toBe(12)
  })

  it('records one entry per note the exercise asked for', () => {
    expect(request(perfectTake()).telemetry.notes).toHaveLength(8)
  })

  it('places each note in a bar and on a beat', () => {
    const notes = request(perfectTake()).telemetry.notes
    expect(notes[0]).toMatchObject({ bar: 1, beatInBar: 1 })
    expect(notes[4]).toMatchObject({ bar: 2, beatInBar: 1 })
  })

  it('records where the note was meant to be played', () => {
    expect(request(perfectTake()).telemetry.notes[0]).toMatchObject({ string: 1, fret: 3 })
  })

  it('records nothing played for a note that never sounded', () => {
    const telemetry = request([played(0, parseNote('C2'))]).telemetry
    expect(telemetry.notes[1].playedMidi).toBeNull()
    expect(telemetry.notes[1].verdict).toBe('missed')
  })

  it('records a measurement rather than an interpretation of it', () => {
    // CO6: the record says "32 ms late", never "rushing".
    const telemetry = request(perfectTake().map((n) => ({ ...n, beat: n.beat + 0.1 }))).telemetry
    expect(telemetry.notes[0].timingErrorMs).toBeCloseTo(100, 0)
    expect(JSON.stringify(telemetry)).not.toMatch(/rush|drag|sloppy/i)
  })

  it('keeps intonation separate from the wrong note', () => {
    const slightlyFlat = perfectTake().map((n) => ({ ...n, cents: -18 }))
    const telemetry = request(slightlyFlat).telemetry
    expect(telemetry.notes[0].semitoneError).toBe(0)
    expect(telemetry.notes[0].centsOffset).toBeLessThan(0)
  })
})

describe('locate', () => {
  it('names a downbeat', () => {
    expect(locate(0, [4, 4])).toBe('bar 1, beat 1')
  })

  it('names a beat later in a bar', () => {
    expect(locate(6, [4, 4])).toBe('bar 2, beat 3')
  })

  it('names an offbeat with its fraction', () => {
    expect(locate(1.5, [4, 4])).toContain('2.50')
  })

  it('counts bars in three-four correctly', () => {
    expect(locate(3, [3, 4])).toBe('bar 2, beat 1')
  })
})

describe('HeuristicCoach', () => {
  it('is always available, because practice cannot depend on a network', async () => {
    expect(await coach.isAvailable()).toBe(true)
  })

  it('says so when a take was clean', async () => {
    const feedback = await coach.analyze(request(perfectTake(), 100))
    expect(feedback.observations.filter((o) => o.severity === 'fix')).toHaveLength(0)
    expect(feedback.headline.length).toBeGreaterThan(0)
  })

  it('names a consistent lag rather than calling it unsteadiness', async () => {
    const late = perfectTake().map((n) => ({ ...n, beat: n.beat + 0.12 }))
    const feedback = await coach.analyze(request(late))
    expect(feedback.observations.map((o) => o.id)).toContain('timing-offset')
  })

  it('names unsteadiness rather than a lag when the notes are scattered', async () => {
    const scattered = [0, 1.2, 1.9, 3.25, 3.8, 5.3, 5.85, 7.2].map((beat) =>
      played(beat, parseNote('C2')),
    )
    const feedback = await coach.analyze(request(scattered))
    const ids = feedback.observations.map((o) => o.id)
    expect(ids).toContain('timing-spread')
    expect(ids).not.toContain('timing-offset')
  })

  it('ignores a timing offset too small for a player to feel', async () => {
    const barelyLate = perfectTake().map((n) => ({ ...n, beat: n.beat + 0.015 }))
    const feedback = await coach.analyze(request(barelyLate))
    expect(feedback.observations.map((o) => o.id)).not.toContain('timing-offset')
  })

  it('recognises a finger one fret off', async () => {
    const sharp = perfectTake().map((n) => ({ ...n, midi: parseNote('C#2') }))
    const feedback = await coach.analyze(request(sharp))
    expect(feedback.observations.map((o) => o.id)).toContain('fret-off-by-one')
  })

  it('recognises the wrong string rather than calling it a wrong note', async () => {
    const octaveUp = perfectTake().map((n) => ({ ...n, midi: parseNote('C3') }))
    const feedback = await coach.analyze(request(octaveUp))
    expect(feedback.observations.map((o) => o.id)).toContain('wrong-octave')
  })

  it('notices notes that never sounded', async () => {
    const feedback = await coach.analyze(request(perfectTake().slice(0, 4)))
    expect(feedback.observations.map((o) => o.id)).toContain('missed-notes')
  })

  it('notices extra attacks', async () => {
    const doubled = [...perfectTake(), played(0.2, parseNote('C2')), played(1.2, parseNote('C2'))]
    const feedback = await coach.analyze(request(doubled))
    expect(feedback.observations.map((o) => o.id)).toContain('extra-notes')
  })

  it('notices consistently sharp fretted notes', async () => {
    const pressed = perfectTake().map((n) => ({ ...n, cents: 40 }))
    const feedback = await coach.analyze(request(pressed))
    expect(feedback.observations.map((o) => o.id)).toContain('intonation')
  })

  it('notices a take that falls apart in its second half', async () => {
    const sixteen = exercise({
      ...eightNotes,
      id: 'test-sixteen',
      notes: Array.from({ length: 16 }, (_, index) => note('A3', index, 1)),
    })
    const notes = Array.from({ length: 16 }, (_, index) =>
      played(index, index < 8 ? parseNote('C2') : parseNote('D2')),
    )
    const judgments = judgePerformance(sixteen.notes, notes, 60)
    const telemetry = buildTelemetry({
      exercise: sixteen,
      judgments,
      bpm: 60,
      latencyCorrectionMs: 0,
      takeId: 't',
      now: NOW,
      learner: {
        level: 1,
        totalAttempts: 1,
        attemptsOnThisExercise: 1,
        bestStarsOnThisExercise: 0,
        daysSinceFirstPractice: 0,
      },
    })
    const feedback = await coach.analyze({
      telemetry,
      exercise: sixteen,
      judgments,
      recentTakes: [],
    })
    expect(feedback.observations.map((o) => o.id)).toContain('fades-late')
  })

  it('never offers more than three things to work on', async () => {
    const bad = [0.4, 1.4, 2.4].map((beat) => played(beat, parseNote('C#3'), { cents: 45 }))
    const feedback = await coach.analyze(request(bad))
    expect(feedback.observations.length).toBeLessThanOrEqual(3)
  })

  it('always gives exactly one next action', async () => {
    for (const take of [perfectTake(), perfectTake().slice(0, 2), []]) {
      const feedback = await coach.analyze(request(take))
      expect(feedback.nextAction.detail.length).toBeGreaterThan(0)
    }
  })

  it('tells a struggling player to slow down', async () => {
    const feedback = await coach.analyze(request(perfectTake().slice(0, 2)))
    expect(feedback.nextAction.kind).toBe('slow-down')
  })

  it('tells a clean player below tempo to speed up', async () => {
    const feedback = await coach.analyze(request(perfectTake(), 70))
    expect(feedback.nextAction.kind).toBe('speed-up')
  })

  it('never suggests speeding up after a poor take', async () => {
    const feedback = await coach.analyze(request(perfectTake().slice(0, 3), 70))
    expect(feedback.nextAction.kind).not.toBe('speed-up')
  })

  it('points at a bar that keeps going wrong across takes', async () => {
    const missOne = () => perfectTake().filter((_, index) => index !== 5)
    const history = [request(missOne()).telemetry, request(missOne()).telemetry]
    const feedback = await coach.analyze(request(missOne(), 60, history))
    expect(feedback.observations.map((o) => o.id)).toContain('recurring-spot')
    expect(feedback.nextAction.kind).toBe('isolate')
  })

  it('does not claim a recurring problem from a single take', async () => {
    const feedback = await coach.analyze(request(perfectTake().slice(0, 7)))
    expect(feedback.observations.map((o) => o.id)).not.toContain('recurring-spot')
  })

  it('identifies itself, so history can say which coach said what', async () => {
    expect((await coach.analyze(request(perfectTake()))).providerId).toBe('heuristic-v1')
  })
})

describe('parseFeedback', () => {
  const valid = {
    headline: 'Solid take.',
    observations: [{ id: 'x', severity: 'watch', statement: 'A thing.', evidence: '12 ms' }],
    nextAction: { kind: 'repeat', detail: 'Again.' },
    confidence: 'high',
  }

  it('accepts a well-formed response', () => {
    expect(parseFeedback(valid, 'model').headline).toBe('Solid take.')
  })

  it('stamps the provider that answered', () => {
    expect(parseFeedback(valid, 'model').providerId).toBe('model')
  })

  it('keeps an optional tempo suggestion', () => {
    const withBpm = { ...valid, nextAction: { kind: 'slow-down', detail: 'Slower.', bpm: 70 } }
    expect(parseFeedback(withBpm, 'model').nextAction.bpm).toBe(70)
  })

  it('keeps an optional bar range', () => {
    const withBars = { ...valid, nextAction: { kind: 'isolate', detail: 'Loop it.', bars: [4, 5] } }
    expect(parseFeedback(withBars, 'model').nextAction.bars).toEqual([4, 5])
  })

  it('caps observations at three however many the model returns', () => {
    const many = { ...valid, observations: Array(9).fill(valid.observations[0]) }
    expect(parseFeedback(many, 'model').observations).toHaveLength(3)
  })

  it('tolerates a missing observation list', () => {
    const bare = { ...valid, observations: undefined }
    expect(parseFeedback(bare, 'model').observations).toEqual([])
  })

  it.each([
    ['not an object', 'a string'],
    ['a missing headline', { ...valid, headline: undefined }],
    ['an empty headline', { ...valid, headline: '   ' }],
    [{ ...valid, observations: [{ ...valid.observations[0], severity: 'urgent' }] }],
    ['an unknown action kind', { ...valid, nextAction: { kind: 'panic', detail: 'x' } }],
    ['a missing action', { ...valid, nextAction: undefined }],
    ['an unknown confidence', { ...valid, confidence: 'certain' }],
  ])('rejects %s rather than rendering it', (_name, value) => {
    expect(() => parseFeedback(value, 'model')).toThrow()
  })

  it('drops a malformed observation but keeps the rest of the answer', () => {
    // One bad field in the middle of a list should not discard a good headline
    // and a good next action.
    const mixed = {
      ...valid,
      observations: [
        valid.observations[0],
        { ...valid.observations[0], severity: 'urgent' },
        { ...valid.observations[0], statement: '' },
      ],
    }
    const parsed = parseFeedback(mixed, 'model')
    expect(parsed.observations).toHaveLength(1)
    expect(parsed.headline).toBe('Solid take.')
  })

  it('fills in a missing observation id rather than discarding the observation', () => {
    const noId = { ...valid, observations: [{ ...valid.observations[0], id: undefined }] }
    expect(parseFeedback(noId, 'model').observations).toHaveLength(1)
  })

  it.each([
    { name: 'a tempo no instrument plays', bpm: 99999 },
    { name: 'a negative tempo', bpm: -5 },
    { name: 'zero', bpm: 0 },
  ])('ignores $name', ({ bpm }) => {
    const odd = { ...valid, nextAction: { kind: 'slow-down', detail: 'Slower.', bpm } }
    expect(parseFeedback(odd, 'model').nextAction.bpm).toBeUndefined()
  })

  it('ignores a bar range that runs backwards or starts before bar one', () => {
    const backwards = { ...valid, nextAction: { kind: 'isolate', detail: 'Loop.', bars: [9, 2] } }
    expect(parseFeedback(backwards, 'model').nextAction.bars).toBeUndefined()
    const zero = { ...valid, nextAction: { kind: 'isolate', detail: 'Loop.', bars: [0, 2] } }
    expect(parseFeedback(zero, 'model').nextAction.bars).toBeUndefined()
  })

  it('clips text long enough to break the layout', () => {
    const essay = { ...valid, headline: 'x'.repeat(5000) }
    expect(parseFeedback(essay, 'model').headline.length).toBeLessThan(500)
  })

  it('ignores a malformed bar range instead of failing the whole response', () => {
    const odd = { ...valid, nextAction: { kind: 'isolate', detail: 'Loop.', bars: ['a', 'b'] } }
    expect(parseFeedback(odd, 'model').nextAction.bars).toBeUndefined()
  })
})
