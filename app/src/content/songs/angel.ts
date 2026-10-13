import type { SongChart } from '../../music/types'
import { bars, note } from '../authoring'

/**
 * "Angel" — Massive Attack featuring Horace Andy, from Mezzanine (1998).
 *
 * The whole six-minute part is two notes, C and the D a tone above it, so
 * everything that makes it work is rhythm: an eighth-note pulse with one
 * sixteenth split on the second beat, and the lift to D on the last eighth of
 * the bar. That makes it an unusually good first song - there is almost no
 * fingering to learn, and all the attention goes where it should.
 */

const FOUR_FOUR = [4, 4] as const

/** The pulse alone: eight even eighths of C, no D, no subdivision. */
const pulseOnly = bars([
  {
    chord: 'Cm',
    notes: Array.from({ length: 8 }, (_, index) => note('A3', index * 0.5, 0.5)),
  },
])

/** Adds the answer note: the last eighth of the bar lifts to D. */
const withAnswer = bars([
  {
    chord: 'Cm',
    notes: [
      ...Array.from({ length: 7 }, (_, index) => note('A3', index * 0.5, 0.5)),
      note('A5', 3.5, 0.5),
    ],
  },
])

/**
 * The full riff. The extra attack is on the second half of beat two: that
 * eighth splits into two sixteenths, which is the detail the simpler written
 * tabs leave out and the thing that gives the line its lope.
 */
const fullRiff = bars([
  {
    chord: 'Cm',
    notes: [
      note('A3', 0, 0.5),
      note('A3', 0.5, 0.5),
      note('A3', 1, 0.5),
      note('A3', 1.5, 0.25),
      note('A3', 1.75, 0.25),
      note('A3', 2, 0.5),
      note('A3', 2.5, 0.5),
      note('A3', 3, 0.5),
      note('A5', 3.5, 0.5),
    ],
  },
])

/** Same notes on the E string, where the thicker string gets closer to the record. */
const fullRiffLowPosition = bars([
  {
    chord: 'Cm',
    notes: [
      note('E8', 0, 0.5),
      note('E8', 0.5, 0.5),
      note('E8', 1, 0.5),
      note('E8', 1.5, 0.25),
      note('E8', 1.75, 0.25),
      note('E8', 2, 0.5),
      note('E8', 2.5, 0.5),
      note('E8', 3, 0.5),
      note('E10', 3.5, 0.5),
    ],
  },
])

export const angel: SongChart = {
  id: 'angel',
  title: 'Angel',
  artist: 'Massive Attack feat. Horace Andy',
  provenance:
    'Transcribed for personal study from the structured note data behind the Songsterr transcription ' +
    '(song 73521), cross-checked against the Ultimate Guitar tab (133434) and bigbasstabs version 3, ' +
    'which agree on the pitches C2 and D2 and on the D landing on the last eighth. An older, widely ' +
    'copied tab places the riff a whole tone lower on B-flat; that reading conflicts with the C pedal ' +
    'the track is built on and is not used here. The sixteenth-note split on beat 2 comes from the ' +
    'Songsterr duration data and appears in no other source, so it is the one detail to verify by ear. ' +
    'Tempo is 107 bpm: three tempo databases agree, and 169 bars at 107 matches the album runtime to ' +
    'within three seconds, while the 104 in the tab header would run it half a minute long.',
  keyCenter: 'C minor',
  timeSignature: FOUR_FOUR,
  targetBpm: 107,
  floorBpm: 50,
  sections: [
    {
      id: 'riff',
      name: 'The riff',
      startBar: 1,
      endBar: 1,
      notes: 'One bar, repeated for the length of the song. The bass never rests.',
    },
  ],
  arrangements: [
    {
      id: 'pulse',
      name: 'Pulse only',
      description:
        'Eight even eighth notes on C. Nothing else. Get this even before adding anything.',
      difficulty: 1,
      bars: pulseOnly,
    },
    {
      id: 'with-answer',
      name: 'With the answer note',
      description: 'The last eighth of the bar lifts to D, then falls back to C on the downbeat.',
      difficulty: 2,
      bars: withAnswer,
    },
    {
      id: 'full',
      name: 'Full riff',
      description: 'Adds the sixteenth-note split on the second half of beat two.',
      difficulty: 3,
      bars: fullRiff,
    },
    {
      id: 'full-low',
      name: 'Full riff, E string',
      description:
        'The same notes at the eighth fret of the E string, for the darker tone on the record.',
      difficulty: 3,
      bars: fullRiffLowPosition,
    },
  ],
  performanceNotes: [
    'The drums are in half time, so the track feels like about 54 bpm even though the bass is running eighths at 107. Set the metronome to 107 and count eighths, or to 54 and feel each click as a half bar.',
    'Even, slightly detached eighths. The groove is in the subdivision and the lift to D, not in playing some notes harder than others.',
    'The record drops the riff an octave for long stretches, to a low C at 33 Hz. A 4-string bass does not go there. Play the whole song in this octave; nothing is lost that a 4-string could have played.',
    'Fingerstyle, right hand near the neck, gets closest to the recorded tone. A pick will be too bright.',
    'The part runs for six minutes without a single rest bar. Stamina in the plucking hand is a real part of learning this one, and it is a good reason to practise it in two-minute blocks.',
  ],
}
