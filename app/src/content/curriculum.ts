import type { Exercise, Lesson, Unit } from '../music/types'
import { DRILLS } from './drills'
import { MELODIES } from './melodies'
import { SONG_EXERCISES } from './songExercises'

/**
 * The path from never having held a bass to playing both target songs.
 *
 * Two things shape the ordering. Material from the songs appears as early as it
 * can be played, so progress is always visibly toward something the learner
 * actually wants rather than toward a distant payoff. And each unit introduces
 * one new demand at a time: the plucking hand before the fretting hand, pitch
 * before rhythm, rhythm before both at once.
 */

export const ALL_EXERCISES: Exercise[] = [...DRILLS, ...MELODIES, ...SONG_EXERCISES]

const EXERCISES_BY_ID = new Map(ALL_EXERCISES.map((item) => [item.id, item]))

export function exerciseById(id: string): Exercise | undefined {
  return EXERCISES_BY_ID.get(id)
}

export const LESSONS: Lesson[] = [
  {
    id: 'setup',
    title: 'Get set up',
    summary:
      'Tune the bass, check the app can hear you, and measure the delay through your interface.',
    briefing: [
      'Check the instrument before you check yourself. Three of the most common reasons a beginner concludes they have no aptitude are a buzzing fret, an action set too high to press, and a bass that is simply out of tune. All three feel exactly like failing, and none of them is.',
      'Fret every note on every string, one at a time, and listen. A buzz in one place is a fret that needs levelling. A buzz everywhere above the fifth fret usually means the neck needs a truss rod adjustment. Either is a setup job, not a practice problem, and a shop will do it in an hour.',
      'Press a string down at the twelfth fret. If it takes real force, the action is too high, and you are about to spend months building pain instead of technique. Have it lowered.',
      'Plug into input 1 on the Scarlett and raise the gain until the halo ring glows green when you play hard. If it flashes red the signal is clipping, which makes the pitch harder to read rather than easier.',
      "Monitor through the interface's own direct monitoring rather than through the app. It is lower latency, and it stops speaker output from reaching the input.",
      'Latency calibration measures how long a note takes to travel from the string to this app. Without it, the app will tell you that you are consistently late when you are not.',
    ],
    exerciseIds: [],
    requires: [],
    estimatedMinutes: 15,
  },
  {
    id: 'plucking-hand',
    title: 'The plucking hand',
    summary: 'Find each string by feel, and make a sound with a consistent tone.',
    briefing: [
      'The pickup is the bar under the strings that senses them, and it is the obvious place to park a thumb. Rest the thumb on the E string instead. The pickup steadies the hand but damps nothing; the thumb on the string is what stops it ringing while you play something else.',
      'A string left to ring is not a small thing. Two strings sounding at once have no single pitch, so the app cannot name the note you played, and neither can a listener.',
      'Pluck with the pad of the finger, about halfway between the first joint and the tip, and pull slightly toward your palm rather than straight up.',
      'Alternate index and middle from the very first session. Using one finger for everything feels easier now and caps your speed permanently.',
    ],
    exerciseIds: [
      'open-string-find',
      'open-strings-quarter',
      'alternating-fingers',
      'string-crossing',
    ],
    requires: ['setup'],
    estimatedMinutes: 15,
  },
  {
    id: 'fretting-hand',
    title: 'The fretting hand',
    summary: 'Press cleanly, use all four fingers, and build a hand position you can keep.',
    briefing: [
      'Press just behind the fret. Further back and the note buzzes; on top of the fret it chokes. Just behind takes the least effort and gives the cleanest sound.',
      'Thumb flat on the back of the neck, roughly opposite the second finger. Hooking it over the top feels natural and takes the little finger out of reach.',
      'One finger per fret: index, middle, ring and little finger cover four consecutive frets without the hand moving. This is the position everything else is built on.',
      'Those four are numbered 1 to 4 from the index, and the thumb has no number: a 3 inside the marker on the neck diagram means the ring finger. If you have played a valved instrument, the number names the finger here, not anything it presses.',
      'Your little finger is weak. That is normal and it is why it needs using, not avoiding.',
    ],
    exerciseIds: [
      'first-fretted-notes',
      'one-finger-per-fret-e',
      'one-finger-per-fret-descending',
      'tab-first-frets',
    ],
    requires: ['plucking-hand'],
    estimatedMinutes: 20,
  },
  {
    id: 'the-neck',
    title: 'Finding notes',
    summary: 'Learn where the notes are on the two strings your songs live on.',
    briefing: [
      'The dots mark frets 3, 5, 7 and 9, with a double dot at 12. They are the only landmarks you get, so learn to find them without looking.',
      'Fret 5 of any string is the same pitch as the next string open. That is how the bass is tuned and it is a free way to check yourself.',
    ],
    exerciseIds: ['notes-on-e-string', 'notes-on-a-string', 'tab-read-angel'],
    requires: ['fretting-hand'],
    estimatedMinutes: 15,
  },
  {
    id: 'reading-tab',
    title: 'Reading tab',
    summary:
      'Read the notation both of your songs are written in, using notes you can already play.',
    briefing: [
      'Four lines, one per string. The bottom line is the thickest string, the low E. Tab is drawn the opposite way up from the way you look down at the neck, which trips up almost everyone once and then never again.',
      'A number on a line is a fret on that string. 0 means play that string open. The number is never a finger and never a note name: 3 on the bottom line is G, and 3 on the line above it is C.',
      'If you read a staff, the trade is this. A staff tells you which note and not where to play it; tab tells you where and not which note. On a bass the same pitch exists in three or four places, and which one you pick changes the fingering and the tone, so tab is specifying something a staff cannot.',
      'Printed tab usually cannot tell you how long a note lasts, which is the real reason it has a reputation for being incomplete. Here the line running to the right of each number is how long that note is held: a number with a long line is one note ringing through the bar, four short ones are four separate notes.',
      'The number by each bar is what the app and the coach mean when they say "bar 4". The counting row beneath it is there because tab has no stems; it is how this chart shows where in the beat a note falls.',
      'A chord symbol above a bar is what the rest of the band is playing, and it is context rather than instruction. The exception is a symbol with a slash in it, like G/B: the letter after the slash is the bass note the arranger wants underneath, and that one is aimed at you.',
      'You can read the same chart on the Songs page, where every arrangement is drawn from exactly the notes the app plays.',
    ],
    exerciseIds: ['tab-open-strings'],
    requires: ['plucking-hand'],
    estimatedMinutes: 10,
  },
  {
    id: 'rhythm',
    title: 'Playing in time',
    summary: 'Quarter notes, eighth notes, rests, and the subdivision Angel is built on.',
    briefing: [
      'Count out loud. Counting in your head is a different and considerably harder skill, and it hides mistakes from you.',
      'Slow is not a lesser version of fast. A passage played accurately at half speed is practice; the same passage played badly at full speed is just repetition of the mistake.',
      'A rest is a thing you do, not a thing you stop doing. Muting a string deliberately is a technique with its own feel.',
    ],
    exerciseIds: ['quarter-and-rest', 'eighth-note-pulse', 'sixteenth-split'],
    requires: ['the-neck'],
    estimatedMinutes: 20,
  },
  {
    id: 'shapes',
    title: 'Shapes that move',
    summary:
      'Octaves, root and fifth, and the first scales — patterns your hand learns once and uses everywhere.',
    briefing: [
      'The bass is tuned in equal fourths, so a shape keeps its sound anywhere you move it. Learn the shape, not the note names, and the note names follow.',
      'Root and fifth is the single most used pair of notes in bass playing. One string over, two frets up.',
      'The octave skips a string: from a root on the E string it is on the D string, two frets up. Do not confuse it with the fifth, which is the adjacent string two frets up.',
    ],
    exerciseIds: [
      'two-note-shuttle',
      'octave-shape',
      'root-and-fifth',
      'major-scale-f',
      'minor-scale-c',
    ],
    requires: ['rhythm'],
    estimatedMinutes: 25,
  },
  {
    id: 'melodies',
    title: 'First tunes',
    summary: 'Three melodies you already know by ear, which makes a wrong note obvious.',
    briefing: [
      'Playing something you know the sound of is how you learn to hear your own mistakes. If it sounds wrong, it is wrong, and you will not need the app to tell you.',
      'Each of these stays in one hand position. The work is the melody and the timing, not moving around the neck.',
    ],
    exerciseIds: ['melody-ode-to-joy', 'melody-twinkle', 'melody-happy-birthday'],
    requires: ['shapes'],
    estimatedMinutes: 25,
  },
  {
    id: 'angel-riff',
    title: 'Angel — the riff',
    summary: 'Two notes, six minutes, and all of it rhythm.',
    briefing: [
      'The entire bass part of Angel is C and the D a tone above it. There is almost no fingering to learn, which is exactly why it is a good first song: everything you have to think about is rhythm.',
      'Build it in stages. Eight even eighths first. Then the lift to D on the last eighth. Then the sixteenth split on beat two, which is what gives the line its lope.',
      'The drums are in half time, so the track feels like 54 bpm while the bass runs eighths at 107. Count eighths against the metronome and do not try to feel it as quarter notes.',
    ],
    exerciseIds: [
      'song-angel-pulse',
      'song-angel-with-answer',
      'song-angel-full',
      'song-angel-full-low',
    ],
    requires: ['rhythm'],
    estimatedMinutes: 30,
  },
  {
    id: 'hymn-roots',
    title: 'This Is the Christ — roots',
    summary: 'One note per chord, through the meter change and the key change.',
    briefing: [
      'The verse is in three-four in E-flat. At bar 12 the meter becomes four-four and the key lifts a whole tone into F for the chorus. That lift, arriving on the words the hymn is named for, is the point of the piece, and your part makes the move with it.',
      'Roots alone is not a lesser version of the part. It is what a bass player would actually play behind congregational singing, and it is the version to be able to play first.',
      'Hold each note for its written value instead of re-plucking every beat. A hymn bass line is mostly sustain.',
      'The scale drill first: E-flat major is the key the verse is in, and every note in the verse comes from it.',
    ],
    exerciseIds: [
      'eb-major-scale',
      'song-this-is-the-christ-roots-verse',
      'song-this-is-the-christ-roots-chorus',
      'song-this-is-the-christ-roots',
    ],
    requires: ['shapes'],
    estimatedMinutes: 30,
  },
  {
    id: 'hymn-full',
    title: 'This Is the Christ — the full line',
    summary: "The hymn's own bass line, one note per beat.",
    briefing: [
      "This is the published piano left hand, moved into the bass guitar's register. It is the part as written, not an arrangement.",
      'Bars 4 and 5 are the ones to isolate: A-flat down to G down to F, then G back up through A to B. They are the only stepwise motion in the verse and they are what makes the line sound like a bass part.',
      'Bars 15 beats 3 and 4 are the only F-sharps in the hymn. They are the third of D7 and they lean into the G that follows. The other accidental is the D-flat at the end of bar 19.',
    ],
    exerciseIds: [
      'song-this-is-the-christ-full-verse',
      'song-this-is-the-christ-full-chorus',
      'song-this-is-the-christ-full',
    ],
    requires: ['hymn-roots', 'melodies'],
    estimatedMinutes: 40,
  },
]

export const UNITS: Unit[] = [
  {
    id: 'foundations',
    title: 'Foundations',
    description: 'Both hands, separately, before they have to work together.',
    lessonIds: ['setup', 'plucking-hand', 'reading-tab', 'fretting-hand'],
  },
  {
    id: 'fundamentals',
    title: 'Fundamentals',
    description: 'Where the notes are, how to stay in time, and the shapes that repeat everywhere.',
    lessonIds: ['the-neck', 'rhythm', 'shapes'],
  },
  {
    id: 'music',
    title: 'Playing music',
    description: 'Tunes you know, so a wrong note is obvious without being told.',
    lessonIds: ['melodies'],
  },
  {
    id: 'repertoire',
    title: 'The songs',
    description: 'The two pieces this whole path is aimed at.',
    lessonIds: ['angel-riff', 'hymn-roots', 'hymn-full'],
  },
]

const LESSONS_BY_ID = new Map(LESSONS.map((lesson) => [lesson.id, lesson]))

export function lessonById(id: string): Lesson | undefined {
  return LESSONS_BY_ID.get(id)
}

/** Lessons in the order a learner meets them, flattened across units. */
export function lessonOrder(): string[] {
  return UNITS.flatMap((unit) => unit.lessonIds)
}
