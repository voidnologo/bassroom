import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PracticeSession,
  type SessionPhase,
  type SessionResult,
} from '../../src/engine/PracticeSession'
import { note } from '../../src/content/authoring'
import { exercise } from '../../src/content/exerciseBuilder'
import { parseNote } from '../../src/music/notes'
import type { Exercise } from '../../src/music/types'
import { FakeAudioInput, FakeTimeKeeper } from '../support/fakeAudio'

const C2 = parseNote('C2')
const D2 = parseNote('D2')

/** Four quarter notes on the third fret of the A string, at 60 bpm. */
const fourNotes: Exercise = exercise({
  id: 'four-notes',
  title: 'Four notes',
  instructions: 'Play four quarter notes on the third fret of the A string.',
  skills: ['quarter-notes'],
  notes: [note('A3', 0, 1), note('A3', 1, 1), note('A3', 2, 1), note('A3', 3, 1)],
  targetBpm: 100,
  floorBpm: 50,
  countInBars: 1,
})

const callResponse: Exercise = exercise({
  id: 'find-them',
  title: 'Find them',
  instructions: 'A note is named on screen; play it when you find it.',
  mode: 'call-response',
  skills: ['note-names-a'],
  notes: [note('A3', 0, 1), note('A5', 1, 1)],
})

interface Harness {
  input: FakeAudioInput
  clock: FakeTimeKeeper
  session: PracticeSession
  phases: SessionPhase[]
  results: SessionResult[]
  prompts: number[]
}

function harness(overrides: { latencyMs?: number } = {}): Harness {
  const input = new FakeAudioInput()
  const clock = new FakeTimeKeeper(input)
  const phases: SessionPhase[] = []
  const results: SessionResult[] = []
  const prompts: number[] = []

  const session = new PracticeSession({
    input,
    createTimeKeeper: () => clock,
    latencyMs: overrides.latencyMs ?? 0,
    callbacks: {
      onPhase: (phase) => phases.push(phase),
      onFinish: (result) => results.push(result),
      onPrompt: (_note, index) => prompts.push(index),
    },
  })

  return { input, clock, session, phases, results, prompts }
}

/** Run the clock to the end of the take and let the settle timer fire. */
function runToEnd(h: Harness): void {
  h.clock.tickTo(8)
  vi.runAllTimers()
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('a play-along take', () => {
  it('starts in the count-in, not playing', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    expect(h.session.currentPhase).toBe('count-in')
  })

  it('moves to playing on the first body beat', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    h.clock.tickTo(0)
    expect(h.session.currentPhase).toBe('playing')
  })

  it('ignores notes played during the count-in', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    h.input.playNote({ time: 0.1, midi: C2 })
    runToEnd(h)
    expect(h.results[0].score.extraNotes).toBe(0)
  })

  it('scores a perfect take as perfect', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    h.clock.tickTo(0)
    for (let beat = 0; beat < 4; beat++) {
      h.input.playNote({ time: h.clock.bodyBeatToTime(beat), midi: C2 })
    }
    runToEnd(h)
    expect(h.results[0].score.overall).toBe(100)
  })

  it('reports every target as missed when nothing is played', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    runToEnd(h)
    expect(h.results[0].score.missedNotes).toBe(4)
  })

  it('finishes exactly once', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    h.clock.tickTo(0)
    runToEnd(h)
    h.clock.tickTo(16)
    vi.runAllTimers()
    expect(h.results).toHaveLength(1)
  })

  it('ends in the finished phase', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    runToEnd(h)
    expect(h.session.currentPhase).toBe('finished')
  })

  it('passes through judging before finishing', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    runToEnd(h)
    expect(h.phases).toContain('judging')
  })

  it('grades a note whose pitch had not resolved when the clock ran out', () => {
    // The settle window exists for this: the last note's pitch arrives after
    // the final beat, and dropping it would report a miss the player did make.
    const h = harness()
    h.session.start(fourNotes, 60)
    h.clock.tickTo(0)
    for (let beat = 0; beat < 3; beat++) {
      h.input.playNote({ time: h.clock.bodyBeatToTime(beat), midi: C2 })
    }
    h.input.emitOnset(h.clock.bodyBeatToTime(3))
    runToEnd(h)
    expect(h.results[0].score.missedNotes).toBe(0)
  })

  it('marks a completed take as not abandoned', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    runToEnd(h)
    expect(h.results[0].abandoned).toBe(false)
  })

  it('reports how long the take took', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    runToEnd(h)
    expect(h.results[0].durationSeconds).toBeGreaterThan(0)
  })
})

describe('latency correction', () => {
  it('treats a note arriving late by the measured latency as on the beat', () => {
    const latencyMs = 40
    const h = harness({ latencyMs })
    h.session.start(fourNotes, 60)
    h.clock.tickTo(0)
    for (let beat = 0; beat < 4; beat++) {
      h.input.playNote({ time: h.clock.bodyBeatToTime(beat) + latencyMs / 1000, midi: C2 })
    }
    runToEnd(h)
    expect(h.results[0].score.meanTimingErrorMs).toBeCloseTo(0, 0)
  })

  it('still reports a real lag once latency is accounted for', () => {
    const h = harness({ latencyMs: 40 })
    h.session.start(fourNotes, 60)
    h.clock.tickTo(0)
    for (let beat = 0; beat < 4; beat++) {
      h.input.playNote({ time: h.clock.bodyBeatToTime(beat) + 0.2, midi: C2 })
    }
    runToEnd(h)
    expect(h.results[0].score.meanTimingErrorMs).toBeCloseTo(160, 0)
  })
})

describe('stopping a take', () => {
  it('reports what was played rather than discarding it', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    h.clock.tickTo(0)
    h.input.playNote({ time: h.clock.bodyBeatToTime(0), midi: C2 })
    h.input.idleUntil(h.clock.bodyBeatToTime(0) + 0.3)
    h.session.stop()
    expect(h.results[0].score.totalTargets).toBe(4)
    expect(h.results[0].score.missedNotes).toBe(3)
  })

  it('marks the take as abandoned', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    h.session.stop()
    expect(h.results[0].abandoned).toBe(true)
  })

  it('can be stopped during the count-in', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    expect(() => h.session.stop()).not.toThrow()
    expect(h.results).toHaveLength(1)
  })

  it('does nothing when stopped twice', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    h.session.stop()
    h.session.stop()
    expect(h.results).toHaveLength(1)
  })

  it('does nothing when stopped before it started', () => {
    const h = harness()
    expect(() => h.session.stop()).not.toThrow()
    expect(h.results).toHaveLength(0)
  })
})

describe('resource handling', () => {
  it('unsubscribes from the audio input when a take ends', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    expect(h.input.pitchListenerCount).toBe(1)
    runToEnd(h)
    expect(h.input.pitchListenerCount).toBe(0)
    expect(h.input.onsetListenerCount).toBe(0)
  })

  it('disposes the beat clock when a take ends', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    runToEnd(h)
    expect(h.clock.disposed).toBe(true)
  })

  it('does not accumulate subscriptions across takes', () => {
    const h = harness()
    for (let take = 0; take < 5; take++) {
      h.session.start(fourNotes, 60)
      expect(h.input.pitchListenerCount).toBe(1)
      h.session.stop()
    }
    expect(h.input.pitchListenerCount).toBe(0)
  })

  it('releases everything on dispose without reporting a result', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    h.session.dispose()
    expect(h.results).toHaveLength(0)
    expect(h.input.pitchListenerCount).toBe(0)
    expect(h.clock.disposed).toBe(true)
  })

  it('does not fire a pending finish timer after dispose', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    h.clock.tickTo(8)
    h.session.dispose()
    vi.runAllTimers()
    expect(h.results).toHaveLength(0)
  })

  it('starts cleanly after a previous take was abandoned mid-count-in', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    h.session.stop()
    h.session.start(fourNotes, 60)
    expect(h.session.currentPhase).toBe('count-in')
    expect(h.input.pitchListenerCount).toBe(1)
  })

  it('does not carry notes from one take into the next', () => {
    const h = harness()
    h.session.start(fourNotes, 60)
    h.clock.tickTo(0)
    for (let beat = 0; beat < 4; beat++) {
      h.input.playNote({ time: h.clock.bodyBeatToTime(beat), midi: C2 })
    }
    runToEnd(h)

    h.session.start(fourNotes, 60)
    runToEnd(h)
    expect(h.results[1].score.missedNotes).toBe(4)
  })
})

describe('a call-and-response take', () => {
  it('runs without being given a tempo, because it is not played at one', () => {
    const h = harness()
    h.session.start(callResponse, null)
    expect(h.session.currentPhase).toBe('playing')
  })

  it('reports no tempo on its result', () => {
    const h = harness()
    h.session.start(callResponse, null)
    h.session.stop()
    expect(h.results[0].bpm).toBeNull()
  })

  it('prompts the first note immediately and does not wait for a clock', () => {
    const h = harness()
    h.session.start(callResponse, 60)
    expect(h.session.currentPhase).toBe('playing')
    expect(h.prompts).toEqual([0])
  })

  it('needs several agreeing frames before accepting an answer', () => {
    const h = harness()
    h.session.start(callResponse, 60)
    h.input.emitPitch({ time: 1, midi: C2 })
    expect(h.session.currentPromptIndex).toBe(0)
  })

  it('advances once the detector has agreed', () => {
    const h = harness()
    h.session.start(callResponse, 60)
    for (let i = 0; i < 4; i++) h.input.emitPitch({ time: 1 + i * 0.02, midi: C2 })
    expect(h.session.currentPromptIndex).toBe(1)
  })

  it('does not advance on the wrong note', () => {
    const h = harness()
    h.session.start(callResponse, 60)
    for (let i = 0; i < 6; i++) h.input.emitPitch({ time: 1 + i * 0.02, midi: D2 })
    expect(h.session.currentPromptIndex).toBe(0)
  })

  it('resets its agreement count when the pitch wavers', () => {
    const h = harness()
    h.session.start(callResponse, 60)
    h.input.emitPitch({ time: 1.0, midi: C2 })
    h.input.emitPitch({ time: 1.02, midi: C2 })
    h.input.emitPitch({ time: 1.04, midi: D2 })
    h.input.emitPitch({ time: 1.06, midi: C2 })
    expect(h.session.currentPromptIndex).toBe(0)
  })

  it('finishes after the last prompt is answered', () => {
    const h = harness()
    h.session.start(callResponse, 60)
    for (let i = 0; i < 4; i++) h.input.emitPitch({ time: 1 + i * 0.02, midi: C2 })
    for (let i = 0; i < 4; i++) h.input.emitPitch({ time: 2 + i * 0.02, midi: D2 })
    expect(h.results).toHaveLength(1)
    expect(h.results[0].score.missedNotes).toBe(0)
  })

  it('ignores onsets, because there is no clock to place them on', () => {
    const h = harness()
    h.session.start(callResponse, 60)
    h.input.emitOnset(1)
    h.input.emitOnset(2)
    for (let i = 0; i < 4; i++) h.input.emitPitch({ time: 3 + i * 0.02, midi: C2 })
    expect(h.session.currentPromptIndex).toBe(1)
  })

  it('finishes immediately for an exercise with no notes', () => {
    const empty = exercise({
      ...callResponse,
      id: 'empty',
      notes: [],
    })
    const h = harness()
    h.session.start(empty, 60)
    expect(h.results).toHaveLength(1)
  })
})

/**
 * A take that is played to a clock cannot run without one. Nothing in the app
 * should reach here, which is why it says what was missing rather than
 * starting a metronome at some tempo nobody chose.
 */
describe('starting a timed exercise with no tempo', () => {
  it('refuses, naming the exercise that needed one', () => {
    const h = harness()
    expect(() => h.session.start(fourNotes, null)).toThrow(/four-notes/)
  })
})
