import type { TargetNote } from '../music/types'

/**
 * The order a take asks for its notes in.
 *
 * A drill whose prompts arrive in the same order every time stops testing what
 * it is for: the learner plays the third string because the third prompt has
 * always been the third string, not because they read the name on screen.
 */

/**
 * Shuffles before giving up and using the written order. An eight-note drill
 * over four strings lands a usable order about a third of the time, so twenty
 * tries come up empty roughly once in eight thousand takes.
 */
const MAX_ATTEMPTS = 20

/**
 * Reorder the notes of a take, keeping every slot's place in the bar.
 *
 * Orders that ask for the same pitch twice running are rejected. The first of
 * the pair leaves the string ringing, and a prompt is passed on the pitch the
 * detector hears, so the second would be credited without being played.
 */
export function shuffleTargets(targets: TargetNote[], random: () => number): TargetNote[] {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = shuffled(targets, random)
    if (!hasAdjacentRepeat(candidate)) return inWrittenSlots(targets, candidate)
  }
  return targets
}

function shuffled(targets: TargetNote[], random: () => number): TargetNote[] {
  const out = [...targets]
  for (let index = out.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    const held = out[index]
    out[index] = out[swap]
    out[swap] = held
  }
  return out
}

function hasAdjacentRepeat(targets: TargetNote[]): boolean {
  return targets.some((note, index) => index > 0 && note.midi === targets[index - 1].midi)
}

function inWrittenSlots(written: TargetNote[], order: TargetNote[]): TargetNote[] {
  return order.map((note, index) => ({
    ...note,
    startBeat: written[index].startBeat,
    durationBeats: written[index].durationBeats,
  }))
}
