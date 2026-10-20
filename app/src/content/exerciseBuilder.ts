import type { MeterChange } from '../music/meter'
import type {
  Exercise,
  SkillId,
  TargetNote,
  TimedExercise,
  TimeSignature,
  UntimedExercise,
} from '../music/types'

/**
 * Defaults for exercise content, so each exercise states only what is unusual
 * about it. A four-four, two-bar count-in at a tempo the learner can actually
 * play is the right answer almost everywhere; writing it out every time buries
 * the fields that do differ.
 */

const FOUR_FOUR: TimeSignature = [4, 4]

interface ExerciseInputBase {
  id: string
  title: string
  instructions: string
  skills: SkillId[]
  notes: TargetNote[]
  timeSignature?: TimeSignature
  meterChanges?: MeterChange[]
  countInBars?: number
  repeats?: number
  shuffleEachTake?: boolean
  keyCenter?: string
  tips?: string[]
}

/**
 * The tempos belong to the play-along case only. Writing one on a drill with
 * no clock is a mistake the author should be told about rather than a number
 * that is quietly stored and never read.
 */
type TimedInput = ExerciseInputBase & {
  mode?: 'play-along'
  targetBpm?: number
  floorBpm?: number
}
type UntimedInput = ExerciseInputBase & { mode: 'call-response' }

export type ExerciseInput = TimedInput | UntimedInput

const DEFAULT_TARGET_BPM = 80

export function exercise(input: TimedInput): TimedExercise
export function exercise(input: UntimedInput): UntimedExercise
export function exercise(input: ExerciseInput): Exercise {
  const shared = { timeSignature: FOUR_FOUR, countInBars: 1, ...input }
  if (input.mode === 'call-response') return { ...shared, mode: 'call-response' }

  const targetBpm = input.targetBpm ?? DEFAULT_TARGET_BPM
  return {
    ...shared,
    mode: 'play-along',
    targetBpm,
    // A floor at 55% of target is slow enough that almost any passage can be
    // played accurately, which is the whole premise of the tempo ladder.
    floorBpm: input.floorBpm ?? Math.max(40, Math.round(targetBpm * 0.55)),
  }
}

/** Notes for a call-and-response drill, where order matters and rhythm does not. */
export function prompts(specs: TargetNote[]): TargetNote[] {
  return specs.map((note, index) => ({ ...note, startBeat: index, durationBeats: 1 }))
}
