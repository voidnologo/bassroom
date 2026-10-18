import type { Exercise } from '../music/types'
import { note, steady } from './authoring'
import { exercise, prompts } from './exerciseBuilder'

/**
 * Technique drills, ordered from the first note a beginner plays to the
 * patterns both target songs are built from.
 *
 * Nothing here is filler. Each drill exists because a specific thing goes wrong
 * without it, and the instructions say what that thing is.
 */

const OPEN_STRINGS = ['E0', 'A0', 'D0', 'G0']

export const DRILLS: Exercise[] = [
  // --- Unit 1: the plucking hand -------------------------------------------
  exercise({
    id: 'open-string-find',
    title: 'Find each string',
    instructions:
      'A string is named on screen. Pluck it. No clock, no pressure — take as long as you need.',
    mode: 'call-response',
    skills: ['plucking-open', 'tuning'],
    notes: prompts(
      ['E0', 'A0', 'D0', 'G0', 'A0', 'E0', 'G0', 'D0'].map((spec) => note(spec, 0, 1)),
    ),
    targetBpm: 60,
    tips: [
      'The pickup is the bar sitting under the strings that senses them. Resting a thumb on it steadies the hand but damps nothing, so rest the thumb on the E string instead: that is what keeps it quiet while you play the others.',
      'Pluck with the pad of the finger, not the tip, and pull slightly toward your palm rather than up.',
    ],
  }),

  exercise({
    id: 'open-strings-quarter',
    title: 'Open strings in time',
    instructions:
      'One note per click on the E string. The only thing being judged is whether you land with the beat.',
    skills: ['plucking-open', 'quarter-notes'],
    notes: steady(['E0', 'E0', 'E0', 'E0']),
    repeats: 4,
    targetBpm: 70,
    floorBpm: 40,
    tips: ['Count out loud. Counting silently is a different and much harder skill.'],
  }),

  exercise({
    id: 'alternating-fingers',
    title: 'Alternating fingers',
    instructions:
      'Eighth notes on the open A string, alternating index and middle. Two notes per click.',
    skills: ['alternating-fingers', 'eighth-notes'],
    notes: Array.from({ length: 8 }, (_, index) => note('A0', index * 0.5, 0.5)),
    repeats: 4,
    targetBpm: 80,
    tips: [
      'Strict alternation: index, middle, index, middle. Using one finger twice in a row is the habit that caps your speed later.',
      'If the notes are uneven in volume, slow down until they are not. Evenness is the point.',
      'Keep the thumb on the E string throughout. At this speed the strings you are not playing pick up ring from the one you are, and two strings sounding together have no clear pitch.',
    ],
  }),

  exercise({
    id: 'string-crossing',
    title: 'Crossing strings',
    instructions: 'Up through the strings and back down, one note per click.',
    skills: ['string-crossing', 'plucking-open'],
    notes: steady([...OPEN_STRINGS, 'G0', 'D0', 'A0', 'E0']),
    repeats: 2,
    targetBpm: 75,
    tips: [
      'Move the thumb with you: on the D string it rests on the E, on the G string it rests on the A.',
      'The hand should travel as little as possible. Let the fingers reach.',
    ],
  }),

  // --- Unit 2: the fretting hand -------------------------------------------
  exercise({
    id: 'first-fretted-notes',
    title: 'Your first fretted notes',
    instructions:
      'Press just behind the fret, not on top of it and not in the middle of the gap. One note at a time.',
    mode: 'call-response',
    skills: ['fretting-basics'],
    notes: prompts([
      note('E1', 0, 1, { finger: 1 }),
      note('E3', 0, 1, { finger: 3 }),
      note('A1', 0, 1, { finger: 1 }),
      note('A3', 0, 1, { finger: 3 }),
      note('D1', 0, 1, { finger: 1 }),
      note('D3', 0, 1, { finger: 3 }),
    ]),
    targetBpm: 60,
    tips: [
      'Just behind the fret takes the least pressure and gives the cleanest note. Further back buzzes; on top of the fret chokes.',
      'Thumb behind the neck, roughly opposite your second finger. Not hooked over the top.',
    ],
  }),

  exercise({
    id: 'one-finger-per-fret-e',
    title: 'One finger per fret — E string',
    instructions:
      'Index on 1, middle on 2, ring on 3, little finger on 4. Each finger stays down as the next one lands.',
    skills: ['fretting-basics', 'quarter-notes'],
    notes: [
      note('E1', 0, 1, { finger: 1 }),
      note('E2', 1, 1, { finger: 2 }),
      note('E3', 2, 1, { finger: 3 }),
      note('E4', 3, 1, { finger: 4 }),
    ],
    repeats: 4,
    targetBpm: 70,
    floorBpm: 40,
    tips: [
      'Leaving each finger down is what builds the hand position. Lifting them one at a time feels easier and teaches you nothing.',
      'The little finger is weak and that is normal. It gets stronger from being used, not from being avoided.',
    ],
  }),

  exercise({
    id: 'one-finger-per-fret-descending',
    title: 'One finger per fret — down',
    instructions:
      'The same four frets in reverse. Put all four fingers down first, then lift them one at a time.',
    skills: ['fretting-basics', 'quarter-notes'],
    notes: [
      note('A4', 0, 1, { finger: 4 }),
      note('A3', 1, 1, { finger: 3 }),
      note('A2', 2, 1, { finger: 2 }),
      note('A1', 3, 1, { finger: 1 }),
    ],
    repeats: 4,
    targetBpm: 70,
    floorBpm: 40,
  }),

  // --- Unit 3: the neck ----------------------------------------------------
  exercise({
    id: 'notes-on-e-string',
    title: 'Notes on the E string',
    instructions: 'A note name appears. Find it on the E string.',
    mode: 'call-response',
    skills: ['note-names-e', 'fretting-basics'],
    notes: prompts(
      ['E0', 'E1', 'E3', 'E5', 'E3', 'E6', 'E8', 'E5'].map((spec) => note(spec, 0, 1)),
    ),
    targetBpm: 60,
    tips: [
      'The dots are your landmarks: 3, 5, 7, 9, and the double dot at 12.',
      'Fret 5 on the E string is the same pitch as the open A string. Use that to check yourself.',
    ],
  }),

  exercise({
    id: 'notes-on-a-string',
    title: 'Notes on the A string',
    instructions: 'The same drill on the A string. These are the notes both of your songs live on.',
    mode: 'call-response',
    skills: ['note-names-a', 'fretting-basics'],
    notes: prompts(
      ['A0', 'A2', 'A3', 'A5', 'A3', 'A6', 'A0', 'A5'].map((spec) => note(spec, 0, 1)),
    ),
    targetBpm: 60,
  }),

  // --- Reading tab ---------------------------------------------------------
  // The chart is shown and the moving cues are not, because reading is the
  // skill being trained: a highway that shows what is coming does the reading
  // for you.
  exercise({
    id: 'tab-open-strings',
    title: 'Read the open strings',
    instructions:
      'Four zeros, one per bar, reading from the bottom line of the tab upward: E, A, D, G. A zero means play that string open.',
    skills: ['reading-tab', 'plucking-open'],
    notes: [note('E0', 0, 4), note('A0', 4, 4), note('D0', 8, 4), note('G0', 12, 4)],
    targetBpm: 60,
    floorBpm: 40,
    tips: [
      'The bottom line is the thickest string, the one nearest your chin when you are playing. Tab is drawn upside down compared to how you look at the neck.',
      'Say the string name out loud before you pluck it. Naming it is what makes the line mean something.',
    ],
  }),

  exercise({
    id: 'tab-first-frets',
    title: 'Read a fretted line',
    instructions:
      'Numbers on the lowest two lines. The number is the fret, not the finger and not the note name.',
    skills: ['reading-tab', 'note-names-e', 'fretting-basics'],
    notes: [...steady(['E0', 'E3', 'E5', 'E3']), ...steady(['A0', 'A3', 'A5', 'A3'], 4)],
    targetBpm: 60,
    floorBpm: 40,
    tips: [
      'A 3 on the bottom line and a 3 on the line above are different notes. The line tells you which string, the number tells you where on it.',
      'Nothing in tab tells you which finger to use. That is a decision you make, and the dots on the neck are what you make it from.',
    ],
  }),

  exercise({
    id: 'tab-read-angel',
    title: 'Read a bar of Angel',
    instructions:
      'The same bar you can see on the Songs page. Read it from the chart rather than from memory.',
    skills: ['reading-tab', 'eighth-notes', 'repertoire'],
    notes: steady(['A3', 'A3', 'A3', 'A3', 'A3', 'A3', 'A3', 'A3'], 0, 0.5),
    targetBpm: 80,
    floorBpm: 44,
    tips: [
      'Eight notes across four beats: two to a beat. The spacing on the chart is what tells you that, which is the part a tab can show and a list of note names cannot.',
      'This is the first bar of Angel. Once you can read it you can read the whole song, because the song is this bar and one more note.',
    ],
  }),

  // --- Unit 4: rhythm ------------------------------------------------------
  exercise({
    id: 'quarter-and-rest',
    title: 'Playing a rest',
    instructions:
      'Two notes, then two beats of silence. Stopping the note is as deliberate an action as starting it.',
    skills: ['rests-and-muting', 'quarter-notes'],
    notes: [note('A3', 0, 1), note('A3', 1, 1)],
    repeats: 4,
    targetBpm: 70,
    tips: [
      'Mute by relaxing the fretting finger until it touches the string without pressing, or by resting a plucking finger on it.',
      'A rest you let ring through is not a rest. The silence is part of the music.',
    ],
  }),

  exercise({
    id: 'eighth-note-pulse',
    title: 'Eighth notes',
    instructions:
      'Two notes per click, evenly spaced. Count "one and two and three and four and" out loud.',
    skills: ['eighth-notes', 'alternating-fingers'],
    notes: Array.from({ length: 8 }, (_, index) => note('A3', index * 0.5, 0.5)),
    repeats: 4,
    targetBpm: 90,
    floorBpm: 45,
  }),

  exercise({
    id: 'sixteenth-split',
    title: 'Splitting a beat into four',
    instructions:
      'Eighth notes, except the second half of beat two splits into two sixteenths. This is the rhythm of the Angel riff.',
    skills: ['sixteenth-notes', 'eighth-notes'],
    notes: [
      note('A3', 0, 0.5),
      note('A3', 0.5, 0.5),
      note('A3', 1, 0.5),
      note('A3', 1.5, 0.25),
      note('A3', 1.75, 0.25),
      note('A3', 2, 0.5),
      note('A3', 2.5, 0.5),
      note('A3', 3, 0.5),
      note('A3', 3.5, 0.5),
    ],
    repeats: 4,
    targetBpm: 90,
    floorBpm: 45,
    tips: ['Count "one and two and-a three and four and". The extra note is the "a".'],
  }),

  // --- Unit 5: moving between notes ----------------------------------------
  exercise({
    id: 'two-note-shuttle',
    title: 'Two-note shuttle',
    instructions:
      'C and D, back and forth. Index finger on 3, ring finger on 5. These are the only two notes in Angel.',
    skills: ['position-shifts', 'quarter-notes'],
    notes: [
      note('A3', 0, 1, { finger: 1 }),
      note('A5', 1, 1, { finger: 3 }),
      note('A3', 2, 1, { finger: 1 }),
      note('A5', 3, 1, { finger: 3 }),
    ],
    repeats: 4,
    targetBpm: 90,
    keyCenter: 'C minor',
  }),

  exercise({
    id: 'octave-shape',
    title: 'The octave shape',
    instructions:
      'Root on the E string, octave two frets up on the D string. The shape is the same anywhere on the neck.',
    skills: ['octave-shape', 'string-crossing'],
    notes: [
      note('E3', 0, 1, { finger: 1 }),
      note('D5', 1, 1, { finger: 4 }),
      note('E3', 2, 2, { finger: 1 }),
    ],
    repeats: 4,
    targetBpm: 75,
    tips: [
      'Over one string and up two frets. Learn it as a shape your hand knows, not as two note names.',
    ],
  }),

  exercise({
    id: 'root-and-fifth',
    title: 'Root and fifth',
    instructions:
      'Root on the E string, fifth one string over and two frets up. The most common two notes in all of bass playing.',
    skills: ['root-fifth', 'string-crossing'],
    notes: [
      note('E3', 0, 1, { finger: 1 }),
      note('A5', 1, 1, { finger: 4 }),
      note('E3', 2, 1, { finger: 1 }),
      note('A5', 3, 1, { finger: 4 }),
    ],
    repeats: 4,
    targetBpm: 80,
  }),

  exercise({
    id: 'major-scale-f',
    title: 'F major, one octave',
    instructions:
      'The major scale starting at the first fret of the E string. Same shape from any root on any string.',
    skills: ['major-scale', 'fretting-basics'],
    notes: steady(['E1', 'E3', 'A0', 'A1', 'A3', 'D0', 'D2', 'D3']),
    repeats: 2,
    targetBpm: 80,
    keyCenter: 'F major',
    tips: ['Say the note names as you play: F G A B-flat C D E F.'],
  }),

  exercise({
    id: 'minor-scale-c',
    title: 'C minor, one octave',
    instructions: 'The scale Angel is built on. Starts at the third fret of the A string.',
    skills: ['minor-scale', 'fretting-basics'],
    notes: steady(['A3', 'A5', 'A6', 'D3', 'D5', 'D6', 'G3', 'G5']),
    repeats: 2,
    targetBpm: 80,
    keyCenter: 'C minor',
  }),

  exercise({
    id: 'eb-major-scale',
    title: 'E-flat major, one octave',
    instructions: 'The key the hymn verse is in. Starts at the sixth fret of the A string.',
    skills: ['major-scale', 'position-shifts'],
    notes: steady(['A6', 'D3', 'D5', 'D6', 'G3', 'G5', 'G7', 'G8']),
    repeats: 2,
    targetBpm: 75,
    keyCenter: 'E-flat major',
  }),
]
