import { describe, expect, it } from 'vitest'
import { note } from '../../src/content/authoring'
import { prompts } from '../../src/content/exerciseBuilder'
import { shuffleTargets } from '../../src/engine/promptOrder'
import type { TargetNote } from '../../src/music/types'

/** mulberry32, so a failure names an order rather than a mood (TS8). */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state)
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296
  }
}

const OPEN_STRINGS = prompts(
  ['E0', 'A0', 'D0', 'G0', 'A0', 'E0', 'G0', 'D0'].map((spec) => note(spec, 0, 1)),
)

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 1234, 20_260_119, 777_777]

function midiOf(targets: TargetNote[]): number[] {
  return targets.map((target) => target.midi)
}

describe('shuffling a drill the learner should not be able to memorise', () => {
  it.each(SEEDS)('asks for the same notes, seed %i', (seed) => {
    const shuffled = shuffleTargets(OPEN_STRINGS, seeded(seed))
    expect(midiOf(shuffled).sort()).toEqual(midiOf(OPEN_STRINGS).sort())
  })

  it.each(SEEDS)('leaves every slot where it was written in the bar, seed %i', (seed) => {
    const shuffled = shuffleTargets(OPEN_STRINGS, seeded(seed))
    expect(shuffled.map((target) => target.startBeat)).toEqual(
      OPEN_STRINGS.map((target) => target.startBeat),
    )
    expect(shuffled.map((target) => target.durationBeats)).toEqual(
      OPEN_STRINGS.map((target) => target.durationBeats),
    )
  })

  /**
   * The first of a pair leaves the string ringing, and a prompt is passed on
   * the pitch the detector hears, so the second would be credited unplayed.
   */
  it.each(SEEDS)('never asks for the same string twice running, seed %i', (seed) => {
    const asked = midiOf(shuffleTargets(OPEN_STRINGS, seeded(seed)))
    expect(asked.filter((midi, index) => index > 0 && midi === asked[index - 1])).toEqual([])
  })

  it('moves the notes rather than handing back the order as written', () => {
    const orders = SEEDS.map((seed) => midiOf(shuffleTargets(OPEN_STRINGS, seeded(seed))).join())
    expect(orders.filter((order) => order !== midiOf(OPEN_STRINGS).join()).length).toBe(
      SEEDS.length,
    )
  })

  it('does not always give the same order, which would defeat the point of shuffling', () => {
    const orders = new Set(
      SEEDS.map((seed) => midiOf(shuffleTargets(OPEN_STRINGS, seeded(seed))).join()),
    )
    expect(orders.size).toBeGreaterThan(1)
  })

  /** Two notes on one string have no order without a repeat, so nothing is invented. */
  it('hands back the written order when no arrangement can avoid a repeat', () => {
    const pair = prompts(['E0', 'E0'].map((spec) => note(spec, 0, 1)))
    expect(shuffleTargets(pair, seeded(5))).toEqual(pair)
  })

  it('keeps the finger a note is written for with that note, not with its slot', () => {
    const fingered = prompts([
      note('E1', 0, 1, { finger: 1 }),
      note('A3', 0, 1, { finger: 3 }),
      note('D1', 0, 1, { finger: 1 }),
      note('G3', 0, 1, { finger: 3 }),
    ])
    const shuffled = shuffleTargets(fingered, seeded(3))
    for (const target of shuffled) {
      const written = fingered.find((candidate) => candidate.midi === target.midi)
      expect(target.finger).toBe(written?.finger)
    }
  })
})
