import type { MeterChange } from '../music/meter'
import type { Exercise, SkillId, SongBar, SongChart, TimeSignature } from '../music/types'
import { flattenBars, resolveSignatures } from './authoring'
import { exercise } from './exerciseBuilder'
import { SONGS } from './songs'

/**
 * Turns song charts into practisable exercises.
 *
 * Generated rather than written out, so that correcting a transcription
 * corrects the drills built on it in the same edit. A song that is practised
 * from a stale copy of its own notes is the failure this avoids.
 */

export interface SongExerciseSpec {
  songId: string
  arrangementId: string
  /** Omit to use the whole chart. */
  sectionId?: string
  title: string
  instructions: string
  skills: SkillId[]
  floorBpm?: number
  repeats?: number
  tips?: string[]
}

export const SONG_EXERCISE_SPECS: SongExerciseSpec[] = [
  {
    songId: 'angel',
    arrangementId: 'pulse',
    title: 'Angel — the pulse',
    instructions: 'Eight even eighth notes on C. No other notes. Evenness is the only goal.',
    skills: ['eighth-notes', 'repertoire'],
    repeats: 8,
    floorBpm: 50,
    tips: [
      'Set the metronome to half this tempo and feel each click as half a bar, which is how the track feels.',
    ],
  },
  {
    songId: 'angel',
    arrangementId: 'with-answer',
    title: 'Angel — the answer note',
    instructions: 'The last eighth of each bar lifts to D, then falls back to C on the downbeat.',
    skills: ['eighth-notes', 'position-shifts', 'repertoire'],
    repeats: 8,
    floorBpm: 50,
  },
  {
    songId: 'angel',
    arrangementId: 'full',
    title: 'Angel — full riff',
    instructions:
      'Adds the sixteenth split on the second half of beat two. Count "one and two and-a three and four and".',
    skills: ['sixteenth-notes', 'repertoire'],
    repeats: 8,
    floorBpm: 55,
  },
  {
    songId: 'angel',
    arrangementId: 'full-low',
    title: 'Angel — on the E string',
    instructions:
      'The same notes at the eighth fret of the E string. Darker, and closer to the record.',
    skills: ['sixteenth-notes', 'position-shifts', 'repertoire'],
    repeats: 8,
    floorBpm: 60,
  },
  {
    songId: 'this-is-the-christ',
    arrangementId: 'roots',
    sectionId: 'verse',
    title: 'This Is the Christ — verse roots',
    instructions: 'One note per chord, in three-four. Let each ring for its full value.',
    skills: ['repertoire', 'quarter-notes'],
    floorBpm: 40,
  },
  {
    songId: 'this-is-the-christ',
    arrangementId: 'roots',
    sectionId: 'chorus',
    title: 'This Is the Christ — chorus roots',
    instructions:
      'Four-four now, and a whole tone higher. The whole section sits in the first six frets.',
    skills: ['repertoire', 'quarter-notes'],
    floorBpm: 40,
  },
  {
    songId: 'this-is-the-christ',
    arrangementId: 'roots',
    title: 'This Is the Christ — whole hymn, roots',
    instructions: 'Verse and chorus together, through the meter change at bar 12.',
    skills: ['repertoire', 'position-shifts'],
    floorBpm: 40,
  },
  {
    songId: 'this-is-the-christ',
    arrangementId: 'full',
    sectionId: 'verse',
    title: 'This Is the Christ — verse, full line',
    instructions:
      'One note per beat. Bars 4 and 5 are the stepwise ones; the rest is close to the roots.',
    skills: ['repertoire', 'position-shifts', 'quarter-notes'],
    floorBpm: 40,
  },
  {
    songId: 'this-is-the-christ',
    arrangementId: 'full',
    sectionId: 'chorus',
    title: 'This Is the Christ — chorus, full line',
    instructions: 'One note per beat through the chorus, including the F-sharp in bar 15.',
    skills: ['repertoire', 'position-shifts'],
    floorBpm: 40,
  },
  {
    songId: 'this-is-the-christ',
    arrangementId: 'full',
    title: 'This Is the Christ — whole hymn, full line',
    instructions: 'The complete bass part, at the marked tempo.',
    skills: ['repertoire', 'position-shifts'],
    floorBpm: 45,
  },
]

export function exerciseId(spec: SongExerciseSpec): string {
  return ['song', spec.songId, spec.arrangementId, spec.sectionId].filter(Boolean).join('-')
}

function buildExercise(spec: SongExerciseSpec, song: SongChart): Exercise {
  const arrangement = song.arrangements.find((candidate) => candidate.id === spec.arrangementId)
  if (!arrangement) {
    throw new Error(`"${song.id}" has no arrangement "${spec.arrangementId}"`)
  }

  const resolved = resolveSignatures(arrangement.bars, song.timeSignature)
  const selected = spec.sectionId ? selectSection(resolved, song, spec.sectionId) : resolved
  const signature: TimeSignature = selected[0]?.timeSignature ?? song.timeSignature
  const meterChanges = meterChangesIn(selected, signature)

  return exercise({
    id: exerciseId(spec),
    title: spec.title,
    instructions: spec.instructions,
    skills: spec.skills,
    keyCenter: song.keyCenter,
    timeSignature: signature,
    meterChanges,
    targetBpm: song.targetBpm,
    floorBpm: spec.floorBpm ?? song.floorBpm,
    repeats: spec.repeats,
    tips: spec.tips ?? song.performanceNotes.slice(0, 2),
    notes: flattenBars(selected, signature),
  })
}

/**
 * The beats at which the meter changes, so a whole-chart exercise can still be
 * barred correctly. Without this the hymn's 4/4 chorus was counted in 3/4.
 */
function meterChangesIn(bars: SongBar[], base: TimeSignature): MeterChange[] {
  const changes: MeterChange[] = []
  let elapsed = 0
  let current = base
  for (const bar of bars) {
    const signature = bar.timeSignature ?? current
    if (signature[0] !== current[0] || signature[1] !== current[1]) {
      changes.push({ atBeat: elapsed, timeSignature: signature })
      current = signature
    }
    elapsed += current[0]
  }
  return changes
}

function selectSection(
  resolved: ReturnType<typeof resolveSignatures>,
  song: SongChart,
  sectionId: string,
) {
  const section = song.sections.find((candidate) => candidate.id === sectionId)
  if (!section) throw new Error(`"${song.id}" has no section "${sectionId}"`)
  return resolved.filter((bar) => bar.index >= section.startBar && bar.index <= section.endBar)
}

export const SONG_EXERCISES: Exercise[] = SONG_EXERCISE_SPECS.map((spec) => {
  const song = SONGS.find((candidate) => candidate.id === spec.songId)
  if (!song) throw new Error(`No song with id "${spec.songId}"`)
  return buildExercise(spec, song)
})
