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

/** Frames at the worklet's hop rate, roughly every 21 ms. */
function feed(tracker: PitchTracker, from: number, to: number, midi: number | null, overrides: Partial<PitchFrame> = {}): void {
  for (let time = from; time <= to; time += 0.021) tracker.push(frame(time, midi, overrides))
}

describe('PitchTracker', () => {
  it('names the pitch of a steady note', () => {
    const tracker = new PitchTracker()
    feed(tracker, 1.0, 1.5, C2)
    expect(tracker.resolve(1.0).midi).toBe(C2)
  })

  it('ignores the attack transient at the start of a note', () => {
    // The first few milliseconds of a pluck read as noise or as a neighbouring
    // pitch; the window deliberately starts after them.
    const tracker = new PitchTracker()
    feed(tracker, 1.0, 1.02, D2)
    feed(tracker, 1.04, 1.4, C2)
    expect(tracker.resolve(1.0).midi).toBe(C2)
  })

  it('takes the most common reading rather than the average', () => {
    // An average of C2 and D2 would land between them, on a note nobody played.
    const tracker = new PitchTracker()
    feed(tracker, 1.05, 1.15, C2)
    tracker.push(frame(1.16, D2))
    feed(tracker, 1.17, 1.2, C2)
    expect(tracker.resolve(1.0).midi).toBe(C2)
  })

  it('reports how much the frames agreed', () => {
    const tracker = new PitchTracker()
    feed(tracker, 1.05, 1.1, C2)
    feed(tracker, 1.11, 1.16, D2)
    const resolution = tracker.resolve(1.0)
    expect(resolution.agreement).toBeGreaterThan(0.3)
    expect(resolution.agreement).toBeLessThan(0.9)
  })

  it('averages intonation across the frames that agreed', () => {
    const tracker = new PitchTracker()
    feed(tracker, 1.05, 1.15, C2, { cents: -20 })
    expect(tracker.resolve(1.0).cents).toBeCloseTo(-20, 0)
  })

  it('reports no pitch when nothing was detected', () => {
    const tracker = new PitchTracker()
    feed(tracker, 1.05, 1.2, null)
    expect(tracker.resolve(1.0).midi).toBeNull()
  })

  it('discards frames the detector was unsure about', () => {
    const tracker = new PitchTracker()
    feed(tracker, 1.05, 1.2, D2, { clarity: 0.5 })
    expect(tracker.resolve(1.0).midi).toBeNull()
  })

  it('ignores frames from after the note being resolved', () => {
    const tracker = new PitchTracker()
    feed(tracker, 1.05, 1.15, C2)
    feed(tracker, 1.3, 1.6, D2)
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
    feed(tracker, 1.0, 1.2, C2)
    expect(tracker.current(1.21)?.midi).toBe(C2)
  })

  it('offers nothing live once the signal has gone quiet', () => {
    const tracker = new PitchTracker()
    feed(tracker, 1.0, 1.2, C2)
    expect(tracker.current(3.0)).toBeNull()
  })

  it('forgets old frames rather than growing without bound', () => {
    const tracker = new PitchTracker()
    feed(tracker, 0, 60, C2)
    expect(tracker.resolve(1.0).midi).toBeNull()
    expect(tracker.resolve(59.9).midi).toBe(C2)
  })

  it('starts clean after a reset', () => {
    const tracker = new PitchTracker()
    feed(tracker, 1.0, 1.5, C2)
    tracker.reset()
    expect(tracker.resolve(1.0).midi).toBeNull()
  })
})
