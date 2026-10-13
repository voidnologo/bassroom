import { describe, expect, it } from 'vitest'
import { DEFAULT_PITCH_TRACKER_OPTIONS, PitchTracker } from '../../src/engine/PitchTracker'
import type { PitchFrame } from '../../src/audio/AudioEngine'
import { parseNote } from '../../src/music/notes'

const C2 = parseNote('C2')
const D2 = parseNote('D2')

function frame(time: number, midi: number | null, overrides: Partial<PitchFrame> = {}): PitchFrame {
  return {
    time,
    frequency: midi === null ? 0 : 100,
    clarity: 0.95,
    rms: 0.2,
    midi,
    cents: 0,
    ...overrides,
  }
}

interface FeedSpan {
  from: number
  to: number
  midi: number | null
  overrides?: Partial<PitchFrame>
}

/** Frames at the worklet's hop rate, roughly every 21 ms. */
function feed(tracker: PitchTracker, span: FeedSpan): void {
  for (let time = span.from; time <= span.to; time += 0.021) {
    tracker.push(frame(time, span.midi, span.overrides))
  }
}

describe('PitchTracker', () => {
  it('names the pitch of a steady note', () => {
    const tracker = new PitchTracker()
    feed(tracker, { from: 1.0, to: 1.5, midi: C2 })
    expect(tracker.resolve(1.0).midi).toBe(C2)
  })

  it('ignores the attack transient at the start of a note', () => {
    // The first few milliseconds of a pluck read as noise or as a neighbouring
    // pitch; the window deliberately starts after them.
    const tracker = new PitchTracker()
    feed(tracker, { from: 1.0, to: 1.02, midi: D2 })
    feed(tracker, { from: 1.04, to: 1.4, midi: C2 })
    expect(tracker.resolve(1.0).midi).toBe(C2)
  })

  it('takes the most common reading rather than the average', () => {
    // An average of C2 and D2 would land between them, on a note nobody played.
    const tracker = new PitchTracker()
    feed(tracker, { from: 1.05, to: 1.15, midi: C2 })
    tracker.push(frame(1.16, D2))
    feed(tracker, { from: 1.17, to: 1.2, midi: C2 })
    expect(tracker.resolve(1.0).midi).toBe(C2)
  })

  it('reports how much the frames agreed', () => {
    const tracker = new PitchTracker()
    feed(tracker, { from: 1.05, to: 1.1, midi: C2 })
    feed(tracker, { from: 1.11, to: 1.16, midi: D2 })
    const resolution = tracker.resolve(1.0)
    expect(resolution.agreement).toBeGreaterThan(0.3)
    expect(resolution.agreement).toBeLessThan(0.9)
  })

  it('averages intonation across the frames that agreed', () => {
    const tracker = new PitchTracker()
    feed(tracker, { from: 1.05, to: 1.15, midi: C2, overrides: { cents: -20 } })
    expect(tracker.resolve(1.0).cents).toBeCloseTo(-20, 0)
  })

  it('reports no pitch when nothing was detected', () => {
    const tracker = new PitchTracker()
    feed(tracker, { from: 1.05, to: 1.2, midi: null })
    expect(tracker.resolve(1.0).midi).toBeNull()
  })

  it('discards frames the detector was unsure about', () => {
    const tracker = new PitchTracker()
    feed(tracker, { from: 1.05, to: 1.2, midi: D2, overrides: { clarity: 0.5 } })
    expect(tracker.resolve(1.0).midi).toBeNull()
  })

  it('ignores frames from after the note being resolved', () => {
    const tracker = new PitchTracker()
    feed(tracker, { from: 1.05, to: 1.15, midi: C2 })
    feed(tracker, { from: 1.3, to: 1.6, midi: D2 })
    expect(tracker.resolve(1.0).midi).toBe(C2)
  })

  it('knows when it has seen enough to answer', () => {
    const tracker = new PitchTracker()
    const windowSeconds = DEFAULT_PITCH_TRACKER_OPTIONS.windowMs / 1000
    expect(tracker.isResolvable(1.0, 1.0 + windowSeconds / 2)).toBe(false)
    expect(tracker.isResolvable(1.0, 1.0 + windowSeconds + 0.01)).toBe(true)
  })

  it('offers the latest reading for the live display', () => {
    const tracker = new PitchTracker()
    feed(tracker, { from: 1.0, to: 1.2, midi: C2 })
    expect(tracker.current(1.21)?.midi).toBe(C2)
  })

  it('offers nothing live once the signal has gone quiet', () => {
    const tracker = new PitchTracker()
    feed(tracker, { from: 1.0, to: 1.2, midi: C2 })
    expect(tracker.current(3.0)).toBeNull()
  })

  it('forgets old frames rather than growing without bound', () => {
    const tracker = new PitchTracker()
    feed(tracker, { from: 0, to: 60, midi: C2 })
    expect(tracker.resolve(1.0).midi).toBeNull()
    expect(tracker.resolve(59.9).midi).toBe(C2)
  })

  it('starts clean after a reset', () => {
    const tracker = new PitchTracker()
    feed(tracker, { from: 1.0, to: 1.5, midi: C2 })
    tracker.reset()
    expect(tracker.resolve(1.0).midi).toBeNull()
  })
})
