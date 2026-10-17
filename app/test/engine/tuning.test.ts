import { describe, expect, it } from 'vitest'
import { settledPitch } from '../../src/engine/tuning'
import type { PitchFrame } from '../../src/audio/contracts'
import { parseNote } from '../../src/music/notes'

const A1 = parseNote('A1')
const E1 = parseNote('E1')

function frame(time: number, midi: number | null, cents = 0, clarity = 0.95): PitchFrame {
  return { time, windowSeconds: 0.128, frequency: 55, clarity, rms: 0.05, midi, cents }
}

/** A steady open A, read once every 21 ms the way the worklet reports it. */
function steady(count: number, from = 0, cents = 4): PitchFrame[] {
  return Array.from({ length: count }, (_, index) => frame(from + index * 0.021, A1, cents))
}

describe('settledPitch', () => {
  it('reports the note the recent readings agree on', () => {
    const result = settledPitch(steady(10), 0.21)
    expect(result?.midi).toBe(A1)
    expect(result?.cents).toBe(4)
  })

  /**
   * The readings from the first moments of a pluck describe mostly the audio
   * before it, and they are confident while being wrong. They are outnumbered,
   * which is the property the mode and the median rely on.
   */
  it('is not dragged off by the confident nonsense right after a pluck', () => {
    const transient = [frame(0, E1, 40), frame(0.021, E1, -45), frame(0.042, A1, -300)]
    const result = settledPitch([...transient, ...steady(12, 0.063)], 0.33)
    expect(result?.midi).toBe(A1)
    expect(result?.cents).toBe(4)
  })

  it('takes the middle of a wobble rather than its extremes', () => {
    const wobbling = [
      frame(0, A1, -20),
      frame(0.021, A1, 2),
      frame(0.042, A1, 3),
      frame(0.063, A1, 4),
      frame(0.084, A1, 30),
    ]
    expect(settledPitch(wobbling, 0.084)?.cents).toBe(3)
  })

  it('ignores readings the detector was unsure of', () => {
    const unsure = Array.from({ length: 10 }, (_, index) => frame(index * 0.021, A1, 50, 0.4))
    expect(settledPitch(unsure, 0.21)).toBeNull()
  })

  it('forgets a note that has stopped sounding', () => {
    expect(settledPitch(steady(10), 5)).toBeNull()
  })

  it('points at nothing until enough readings agree', () => {
    expect(settledPitch(steady(2), 0.042)).toBeNull()
  })

  it('follows the string when it is tuned to a different note', () => {
    const before = steady(10, 0)
    const after = Array.from({ length: 10 }, (_, index) => frame(0.5 + index * 0.021, E1, -6))
    expect(settledPitch([...before, ...after], 0.71)?.midi).toBe(E1)
  })
})
