import type { Exercise, PracticeMode, SkillId, TargetNote, TimeSignature } from '../music/types'

/**
 * Defaults for exercise content, so each exercise states only what is unusual
 * about it. A four-four, two-bar count-in at a tempo the learner can actually
 * play is the right answer almost everywhere; writing it out every time buries
 * the fields that do differ.
 */

const FOUR_FOUR: TimeSignature = [4, 4]

export interface ExerciseInput {
  id: string
  title: string
  instructions: string
  skills: SkillId[]
  notes: TargetNote[]
  mode?: PracticeMode
  timeSignature?: TimeSignature
  targetBpm?: number
  floorBpm?: number
  countInBars?: number
  repeats?: number
  keyCenter?: string
  tips?: string[]
}

export function exercise(input: ExerciseInput): Exercise {
  const targetBpm = input.targetBpm ?? 80
  return {
    mode: 'play-along',
    timeSignature: FOUR_FOUR,
    countInBars: 1,
    ...input,
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
