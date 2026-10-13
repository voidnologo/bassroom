import type { SongChart } from '../../music/types'
import { bars, note, steady } from '../authoring'

/**
 * "This Is the Christ" — Michael Finlinson Moody, 1995.
 *
 * The verse is in 3/4 in E flat; bar 12 turns into 4/4 and the chorus lifts a
 * whole tone into F. That lift, under the words the song is named for, is the
 * reason the key change is worth getting right rather than smoothing over.
 */

const THREE_FOUR = [3, 4] as const
const FOUR_FOUR = [4, 4] as const

/** Chord roots only: what to play first, and what suits congregational singing. */
const roots = bars(
  [
    { chord: undefined, notes: [] },
    { chord: 'Eb', notes: [note('A6', 0, 3)] },
    { chord: 'Eb', notes: [note('A6', 0, 2), note('A3', 2, 1)] },
    { chord: 'Ab', notes: [note('E4', 0, 3)] },
    { chord: 'G', notes: [note('E3', 0, 3)] },
    { chord: 'Cm', notes: [note('A3', 0, 3)] },
    { chord: 'Gm', notes: [note('E3', 0, 1), note('E1', 1, 2)] },
    { chord: 'Eb', notes: [note('A6', 0, 1), note('A3', 1, 1), note('E6', 2, 1)] },
    { chord: 'Eb', notes: [note('A6', 0, 3)] },
    { chord: 'Abm', notes: [note('E4', 0, 3)] },
    { chord: 'Eb', notes: [note('A6', 0, 2), note('E3', 2, 1)] },
    { chord: 'Cm', timeSignature: FOUR_FOUR, notes: [note('A3', 0, 3), note('E6', 3, 1)] },
    { chord: 'C', notes: [note('A3', 0, 4)] },
    { chord: 'G/B', notes: [note('A2', 0, 2), note('A0', 2, 2)] },
    { chord: 'C', notes: [note('A3', 0, 2), note('D0', 2, 2)] },
    { chord: 'G7', notes: [note('E3', 0, 4)] },
    { chord: 'C7', notes: [note('A3', 0, 4)] },
    { chord: 'F', notes: [note('E1', 0, 4)] },
    { chord: 'Bbm', notes: [note('E6', 0, 4)] },
    { chord: 'F/C', notes: [note('A3', 0, 4)] },
    { chord: 'F', notes: [note('E1', 0, 2), note('E1', 2, 1), note('E6', 3, 1)] },
    { chord: 'F/C', notes: [note('A3', 0, 4)] },
    { chord: 'Gm', notes: [note('E3', 0, 2), note('A3', 2, 2)] },
    { chord: 'F', notes: [note('E1', 0, 3), note('E6', 3, 1)] },
    { chord: 'F', notes: [note('E1', 0, 4)] },
  ],
  1,
)

/**
 * The hymn's own bass line: the published piano left hand, moved into the bass
 * guitar's register. One note per beat throughout.
 */
const full = bars(
  [
    { chord: undefined, notes: [] },
    { chord: 'Eb', notes: steady(['A6', 'A6', 'A6']) },
    { chord: 'Eb', notes: steady(['A6', 'A6', 'A3']) },
    { chord: 'Ab', notes: steady(['E4', 'E3', 'E1']) },
    { chord: 'G', notes: steady(['E3', 'A0', 'A2']) },
    { chord: 'Cm', notes: steady(['A3', 'A3', 'E4']) },
    { chord: 'Gm', notes: [note('E3', 0, 1), note('E1', 1, 1)] },
    { chord: 'Eb', notes: steady(['E6', 'A3', 'E6']) },
    { chord: 'Eb', notes: steady(['A6', 'A6', 'A6']) },
    { chord: 'Abm', notes: steady(['E4', 'E4', 'E4']) },
    { chord: 'Eb', notes: steady(['E3', 'E3', 'A2']) },
    { chord: 'Cm', timeSignature: FOUR_FOUR, notes: steady(['A3', 'A3', 'E4', 'E6']) },
    { chord: 'C', notes: steady(['A3', 'A3', 'A3', 'E3']) },
    { chord: 'G/B', notes: steady(['A2', 'A2', 'A0', 'A0']) },
    { chord: 'C', notes: steady(['E3', 'E3', 'E2', 'E2']) },
    { chord: 'G7', notes: steady(['E3', 'D0', 'E3', 'E3']) },
    { chord: 'C7', notes: steady(['A3', 'A3', 'A3', 'A3']) },
    { chord: 'F', notes: steady(['E1', 'E1', 'E1', 'E1']) },
    { chord: 'Bbm', notes: steady(['E1', 'E1', 'E1', 'A4']) },
    { chord: 'F/C', notes: steady(['A3', 'A3', 'A3', 'A3']) },
    { chord: 'F', notes: steady(['E1', 'E1', 'E6', 'E6']) },
    { chord: 'F/C', notes: steady(['A3', 'A3', 'A3', 'A3']) },
    { chord: 'Gm', notes: steady(['E3', 'E3', 'A3', 'A3']) },
    { chord: 'F', notes: steady(['E1', 'E1', 'E1', 'E1']) },
    { chord: 'F', notes: [note('E1', 0, 4)] },
  ],
  1,
)

export const thisIsTheChrist: SongChart = {
  id: 'this-is-the-christ',
  title: 'This Is the Christ',
  artist: 'Michael Finlinson Moody / James E. Faust',
  provenance:
    "Derived from the publisher's own MusicXML (this-is-the-christ.mxl, churchofjesuschrist.org), " +
    'not transcribed by ear: every pitch, chord symbol, meter change and key change is read from that ' +
    'file. The "roots" arrangement is the chord roots; the "full" arrangement is the published piano ' +
    'left hand moved into the bass guitar register, with notes above D3 dropped an octave. ' +
    'Cross-checked against the Capo 3 guitar PDF and the published MIDI. High confidence. ' +
    'Copyright 1995, 2024 IRI; transcribed here for personal study.',
  keyCenter: 'E-flat major, modulating to F major',
  timeSignature: THREE_FOUR,
  targetBpm: 66,
  floorBpm: 40,
  sections: [
    {
      id: 'pickup',
      name: 'Pickup',
      startBar: 1,
      endBar: 1,
      notes: 'The bass is silent. Count it in.',
    },
    { id: 'verse', name: 'Verse', startBar: 2, endBar: 11, notes: '3/4 in E-flat major.' },
    {
      id: 'turn',
      name: 'Turn',
      startBar: 12,
      endBar: 12,
      notes: 'The meter becomes 4/4 and the B-flat sets up the key change.',
    },
    {
      id: 'chorus',
      name: 'Chorus',
      startBar: 13,
      endBar: 25,
      notes: 'A whole tone higher, landing in F major.',
    },
  ],
  arrangements: [
    {
      id: 'roots',
      name: 'Roots',
      description: 'One note per chord. Let each ring for its full value.',
      difficulty: 1,
      bars: roots,
    },
    {
      id: 'full',
      name: 'Full line',
      description: "The hymn's own bass line, one note per beat.",
      difficulty: 2,
      bars: full,
    },
  ],
  performanceNotes: [
    'Marked tempo is a quarter note at 63 to 69. Start at 40 and let the ladder bring you up.',
    'Bars 4 and 5 are the two to learn first in the full line: A-flat down to F, then G back up through A to B. They are the only stepwise motion in the verse, and they are what makes it sound like a bass part rather than a list of roots.',
    'Bar 15 beat 3 is the only sharp in the piece, an F-sharp. It is the third of D7 and it pulls toward the G in bar 16.',
    'The whole chorus sits inside the first six frets. If your hand is moving a lot there, you are playing it in the wrong place.',
    'Hold notes for their written length instead of re-plucking on every beat. A hymn bass line is mostly sustain.',
  ],
}
