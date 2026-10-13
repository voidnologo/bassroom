import { describe, expect, it } from 'vitest'
import { expandRepeats } from '../../src/engine/PracticeSession'
import { note } from '../../src/content/authoring'
import { exercise } from '../../src/content/exerciseBuilder'

describe('expandRepeats', () => {
  const oneBar = exercise({
    id: 'one-bar',
    title: 'One bar',
    instructions: 'Four quarter notes on the open A string, one per click.',
    skills: ['quarter-notes'],
    notes: [note('A0', 0, 1), note('A0', 1, 1), note('A0', 2, 1), note('A0', 3, 1)],
  })

  it('leaves a single pass untouched', () => {
    expect(expandRepeats(oneBar)).toHaveLength(4)
  })

  it('repeats the note list the requested number of times', () => {
    expect(expandRepeats({ ...oneBar, repeats: 4 })).toHaveLength(16)
  })

  it('places each pass a whole bar after the last', () => {
    const expanded = expandRepeats({ ...oneBar, repeats: 2 })
    expect(expanded[4].startBeat).toBe(4)
  })

  it('keeps the notes in order across passes', () => {
    const starts = expandRepeats({ ...oneBar, repeats: 3 }).map((item) => item.startBeat)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('rounds a partial bar up so repeats stay on the barline', () => {
    // Three beats of music in four-four repeats every four beats, not every
    // three, or the second pass starts on beat four of bar one.
    const threeBeats = exercise({
      ...oneBar,
      id: 'three-beats',
      notes: [note('A0', 0, 1), note('A0', 1, 1), note('A0', 2, 1)],
      repeats: 2,
    })
    expect(expandRepeats(threeBeats)[3].startBeat).toBe(4)
  })

  it('respects a three-four bar length', () => {
    const waltz = exercise({
      ...oneBar,
      id: 'waltz',
      timeSignature: [3, 4],
      notes: [note('A0', 0, 1), note('A0', 1, 1), note('A0', 2, 1)],
      repeats: 2,
    })
    expect(expandRepeats(waltz)[3].startBeat).toBe(3)
  })

  it('keeps the position and finger of every repeated note', () => {
    const fingered = exercise({ ...oneBar, notes: [note('A3', 0, 1, { finger: 1 })], repeats: 2 })
    expect(expandRepeats(fingered)[1].finger).toBe(1)
    expect(expandRepeats(fingered)[1].position).toEqual({ string: 1, fret: 3 })
  })

  it('treats one repeat as no repeat', () => {
    expect(expandRepeats({ ...oneBar, repeats: 1 })).toHaveLength(4)
  })
})
