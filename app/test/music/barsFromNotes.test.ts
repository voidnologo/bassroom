import { describe, expect, it } from 'vitest'
import { barsFromNotes } from '../../src/music/tab'
import { note, steady } from '../../src/content/authoring'

const FOUR_FOUR = [4, 4] as const

describe('barsFromNotes', () => {
  it('splits a run of notes at the bar line', () => {
    const bars = barsFromNotes(steady(['E0', 'E0', 'E0', 'E0', 'A0', 'A0']), FOUR_FOUR)
    expect(bars.map((bar) => bar.index)).toEqual([1, 2])
    expect(bars[0].notes).toHaveLength(4)
    expect(bars[1].notes).toHaveLength(2)
  })

  it('restates each beat from the start of its own bar, as a chart does', () => {
    const bars = barsFromNotes(steady(['E0', 'E0', 'E0', 'E0', 'A0']), FOUR_FOUR)
    expect(bars[0].notes.map((n) => n.startBeat)).toEqual([0, 1, 2, 3])
    expect(bars[1].notes[0].startBeat).toBe(0)
  })

  it('keeps where a note is played, not just its pitch', () => {
    const bars = barsFromNotes([note('A3', 0, 1)], FOUR_FOUR)
    expect(bars[0].notes[0].position).toEqual({ string: 1, fret: 3 })
  })

  it('places eighth notes inside the beat they belong to', () => {
    const bars = barsFromNotes(steady(['A3', 'A3', 'A3', 'A3'], 0, 0.5), FOUR_FOUR)
    expect(bars[0].notes.map((n) => n.startBeat)).toEqual([0, 0.5, 1, 1.5])
  })

  it('returns no bars for an exercise with no notes', () => {
    expect(barsFromNotes([], FOUR_FOUR)).toEqual([])
  })
})
