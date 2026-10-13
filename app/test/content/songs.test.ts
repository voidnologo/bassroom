import { describe, expect, it } from 'vitest'
import { SONGS, angel, songById, thisIsTheChrist } from '../../src/content/songs'
import { resolveSignatures, totalBeats } from '../../src/content/authoring'
import { FRET_COUNT, STANDARD_TUNING, midiAt } from '../../src/music/fretboard'
import { noteName } from '../../src/music/notes'
import type { Arrangement, SongChart } from '../../src/music/types'

const everyArrangement: Array<{ song: SongChart; arrangement: Arrangement }> = SONGS.flatMap(
  (song) => song.arrangements.map((arrangement) => ({ song, arrangement })),
)

/** The shape vitest prints when a case fails, so a failure names the song. */
const cases = everyArrangement.map(({ song, arrangement }) => ({
  name: `${song.title} / ${arrangement.name}`,
  song,
  arrangement,
}))

describe.each(SONGS.map((song) => ({ name: song.title, song })))('$name', ({ song }) => {
  it('states where its notes came from', () => {
    expect(song.provenance.length).toBeGreaterThan(80)
  })

  it('states a key, a meter, and a target tempo', () => {
    expect(song.keyCenter).toBeTruthy()
    expect(song.timeSignature[0]).toBeGreaterThan(0)
    expect(song.targetBpm).toBeGreaterThan(0)
  })

  it('can be practised slower than it is performed', () => {
    expect(song.floorBpm).toBeLessThanOrEqual(song.targetBpm)
    expect(song.floorBpm).toBeGreaterThanOrEqual(30)
  })

  it('offers at least one arrangement', () => {
    expect(song.arrangements.length).toBeGreaterThan(0)
  })

  it('orders its arrangements from easiest to hardest', () => {
    const difficulties = song.arrangements.map((arrangement) => arrangement.difficulty)
    expect(difficulties).toEqual([...difficulties].sort((a, b) => a - b))
  })

  it('covers every bar with a section', () => {
    const lastBar = Math.max(
      ...song.arrangements.flatMap((arrangement) => arrangement.bars.map((bar) => bar.index)),
    )
    const covered = new Set(
      song.sections.flatMap((section) =>
        Array.from(
          { length: section.endBar - section.startBar + 1 },
          (_, i) => section.startBar + i,
        ),
      ),
    )
    for (let bar = 1; bar <= lastBar; bar++) expect(covered.has(bar)).toBe(true)
  })

  it('gives the player something to read about how it should sound', () => {
    expect(song.performanceNotes.length).toBeGreaterThan(0)
  })
})

describe.each(cases)('$name', ({ song, arrangement }) => {
  const resolved = resolveSignatures(arrangement.bars, song.timeSignature)

  it('plays every note on a 4-string in standard tuning', () => {
    for (const bar of resolved) {
      for (const note of bar.notes) {
        expect(note.midi).toBeGreaterThanOrEqual(STANDARD_TUNING[0])
        expect(note.midi).toBeLessThanOrEqual(STANDARD_TUNING[3] + FRET_COUNT)
      }
    }
  })

  it('keeps each note on a real string and fret', () => {
    for (const bar of resolved) {
      for (const note of bar.notes) {
        expect(note.position).toBeDefined()
        expect(note.position!.string).toBeGreaterThanOrEqual(0)
        expect(note.position!.string).toBeLessThan(STANDARD_TUNING.length)
        expect(note.position!.fret).toBeGreaterThanOrEqual(0)
        expect(note.position!.fret).toBeLessThanOrEqual(FRET_COUNT)
      }
    }
  })

  it('keeps the written pitch and the written position in agreement', () => {
    for (const bar of resolved) {
      for (const note of bar.notes) {
        expect(noteName(midiAt(note.position!))).toBe(noteName(note.midi))
      }
    }
  })

  it('keeps every note inside its own bar', () => {
    for (const bar of resolved) {
      const beatsInBar = bar.timeSignature![0]
      for (const note of bar.notes) {
        expect(note.startBeat).toBeGreaterThanOrEqual(0)
        expect(note.startBeat + note.durationBeats).toBeLessThanOrEqual(beatsInBar + 1e-9)
      }
    }
  })

  it('lists the notes of each bar in playing order', () => {
    for (const bar of resolved) {
      const starts = bar.notes.map((note) => note.startBeat)
      expect(starts).toEqual([...starts].sort((a, b) => a - b))
    }
  })

  it('never asks for two notes at the same instant', () => {
    for (const bar of resolved) {
      const starts = bar.notes.map((note) => note.startBeat)
      expect(new Set(starts).size).toBe(starts.length)
    }
  })

  it('numbers its bars consecutively from one', () => {
    expect(arrangement.bars.map((bar) => bar.index)).toEqual(
      arrangement.bars.map((_, offset) => offset + 1),
    )
  })

  it('is the same length as every other arrangement of the song', () => {
    const beats = totalBeats(resolved, song.timeSignature)
    const reference = totalBeats(
      resolveSignatures(song.arrangements[0].bars, song.timeSignature),
      song.timeSignature,
    )
    expect(beats).toBe(reference)
  })
})

describe('This Is the Christ', () => {
  const roots = resolveSignatures(
    thisIsTheChrist.arrangements[0].bars,
    thisIsTheChrist.timeSignature,
  )

  it('leaves the pickup bar to the voices', () => {
    expect(roots[0].notes).toHaveLength(0)
  })

  it('is in three-four for the verse', () => {
    expect(roots[5].timeSignature).toEqual([3, 4])
  })

  it('turns into four-four at bar 12', () => {
    expect(roots[11].timeSignature).toEqual([4, 4])
  })

  it('stays in four-four for the rest of the chorus', () => {
    for (const bar of roots.slice(11)) expect(bar.timeSignature).toEqual([4, 4])
  })

  it('opens the verse on E-flat', () => {
    expect(noteName(roots[1].notes[0].midi)).toBe('Eb2')
  })

  it('lifts from B-flat at the end of the turn to C at the chorus', () => {
    const turn = roots[11].notes
    expect(noteName(turn[turn.length - 1].midi)).toBe('Bb1')
    expect(noteName(roots[12].notes[0].midi)).toBe('C2')
  })

  it('ends on F, the key the chorus modulates to', () => {
    const last = roots[roots.length - 1].notes
    expect(noteName(last[last.length - 1].midi)).toBe('F1')
  })

  it('walks down and back up through bars 4 and 5 in the full line', () => {
    const full = thisIsTheChrist.arrangements[1].bars
    expect(full[3].notes.map((note) => noteName(note.midi))).toEqual(['Ab1', 'G1', 'F1'])
    expect(full[4].notes.map((note) => noteName(note.midi))).toEqual(['G1', 'A1', 'B1'])
  })

  it('has exactly one sharp in the whole piece, the F-sharp in bar 15', () => {
    const full = resolveSignatures(
      thisIsTheChrist.arrangements[1].bars,
      thisIsTheChrist.timeSignature,
    )
    const sharpBars = full.filter((bar) => bar.notes.some((note) => note.midi % 12 === 6))
    expect(sharpBars.map((bar) => bar.index)).toEqual([15])
  })

  it('keeps the whole chorus inside the first six frets', () => {
    for (const bar of roots.filter((candidate) => candidate.index >= 13)) {
      for (const note of bar.notes) expect(note.position!.fret).toBeLessThanOrEqual(6)
    }
  })
})

describe('Angel', () => {
  const full = angel.arrangements.find((arrangement) => arrangement.id === 'full')!

  it('uses only two pitches in the whole riff', () => {
    const pitches = new Set(full.bars[0].notes.map((note) => noteName(note.midi)))
    expect([...pitches].sort()).toEqual(['C2', 'D2'])
  })

  it('attacks nine times in the bar', () => {
    expect(full.bars[0].notes).toHaveLength(9)
  })

  it('splits the second half of beat two into two sixteenths', () => {
    const sixteenths = full.bars[0].notes.filter((note) => note.durationBeats === 0.25)
    expect(sixteenths.map((note) => note.startBeat)).toEqual([1.5, 1.75])
  })

  it('answers with D on the last eighth of the bar', () => {
    const last = full.bars[0].notes[full.bars[0].notes.length - 1]
    expect(last.startBeat).toBe(3.5)
    expect(noteName(last.midi)).toBe('D2')
  })

  it('plays the same pitches in both fingerings', () => {
    const low = angel.arrangements.find((arrangement) => arrangement.id === 'full-low')!
    expect(low.bars[0].notes.map((note) => note.midi)).toEqual(
      full.bars[0].notes.map((note) => note.midi),
    )
  })

  it('offers the easy fingering on the A string and the record fingering on the E', () => {
    const low = angel.arrangements.find((arrangement) => arrangement.id === 'full-low')!
    expect(full.bars[0].notes.every((note) => note.position!.string === 1)).toBe(true)
    expect(low.bars[0].notes.every((note) => note.position!.string === 0)).toBe(true)
  })

  it('builds up from a pulse with no answer note', () => {
    const pulse = angel.arrangements.find((arrangement) => arrangement.id === 'pulse')!
    expect(new Set(pulse.bars[0].notes.map((note) => note.midi)).size).toBe(1)
  })
})

describe('songById', () => {
  it('finds a song by its id', () => {
    expect(songById('angel')?.title).toBe('Angel')
  })

  it('returns nothing for an unknown id', () => {
    expect(songById('nope')).toBeUndefined()
  })
})
