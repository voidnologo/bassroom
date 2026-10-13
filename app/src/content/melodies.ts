import type { Exercise } from '../music/types'
import { note, steady } from './authoring'
import { exercise } from './exerciseBuilder'

/**
 * Public-domain melodies, used as the first pieces that sound like music
 * rather than like an exercise.
 *
 * All three are out of copyright, including "Happy Birthday to You", whose
 * claimed copyright was invalidated in 2016. Each is arranged to sit in one
 * hand position so that the melody, not the shifting, is what is being learned.
 */

const THREE_FOUR = [3, 4] as const

export const MELODIES: Exercise[] = [
  exercise({
    id: 'melody-ode-to-joy',
    title: 'Ode to Joy',
    instructions:
      'Beethoven, 1824. Everything is a quarter note except the end of each phrase. Your hand does not move.',
    skills: ['melody-playing', 'quarter-notes', 'fretting-basics'],
    keyCenter: 'C major',
    targetBpm: 100,
    floorBpm: 45,
    notes: [
      ...steady(['D2', 'D2', 'D3', 'D5'], 0),
      ...steady(['D5', 'D3', 'D2', 'D0'], 4),
      ...steady(['A3', 'A3', 'D0', 'D2'], 8),
      note('D2', 12, 1.5),
      note('D0', 13.5, 0.5),
      note('D0', 14, 2),
      ...steady(['D2', 'D2', 'D3', 'D5'], 16),
      ...steady(['D5', 'D3', 'D2', 'D0'], 20),
      ...steady(['A3', 'A3', 'D0', 'D2'], 24),
      note('D0', 28, 1.5),
      note('A3', 29.5, 0.5),
      note('A3', 30, 2),
    ],
    tips: [
      'Everything lives on the D string between the open string and the fifth fret, plus one note on the A string.',
      'The two long notes at the end of each phrase are where most people rush. Hold them for their full length.',
    ],
  }),

  exercise({
    id: 'melody-twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    instructions:
      'A French folk tune from 1761. Two phrases, each ending on a note held for two beats.',
    skills: ['melody-playing', 'quarter-notes', 'string-crossing'],
    keyCenter: 'C major',
    targetBpm: 90,
    floorBpm: 45,
    notes: [
      ...steady(['A3', 'A3', 'G0', 'G0'], 0),
      ...steady(['G2', 'G2'], 4),
      note('G0', 6, 2),
      ...steady(['D3', 'D3', 'D2', 'D2'], 8),
      ...steady(['D0', 'D0'], 12),
      note('A3', 14, 2),
    ],
    tips: ['This one crosses three strings. Let the plucking thumb follow you across.'],
  }),

  exercise({
    id: 'melody-happy-birthday',
    title: 'Happy Birthday',
    instructions:
      'In three-four, and it starts before the bar does: the first two notes are the pickup, on the third beat.',
    skills: ['melody-playing', 'dotted-rhythms', 'string-crossing'],
    keyCenter: 'C major',
    timeSignature: THREE_FOUR,
    targetBpm: 110,
    floorBpm: 50,
    countInBars: 2,
    notes: [
      note('E3', 2, 0.5),
      note('E3', 2.5, 0.5),
      ...steady(['A0', 'E3', 'A3'], 3),
      note('A2', 6, 2),
      note('E3', 8, 0.5),
      note('E3', 8.5, 0.5),
      ...steady(['A0', 'E3', 'D0'], 9),
      note('A3', 12, 2),
      note('E3', 14, 0.5),
      note('E3', 14.5, 0.5),
      ...steady(['G0', 'D2', 'A3'], 15),
      ...steady(['A2', 'A0'], 18),
      note('D3', 20, 0.5),
      note('D3', 20.5, 0.5),
      ...steady(['D2', 'A3', 'D0'], 21),
      note('A3', 24, 3),
    ],
    tips: [
      'The pickup is what makes this feel right. Count "one two three" and come in on three.',
      'The high note in the third phrase is the open G string — the only time you use it.',
    ],
  }),
]
