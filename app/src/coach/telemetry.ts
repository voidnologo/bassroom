import type { NoteJudgment } from '../engine/judge'
import { scorePerformance } from '../engine/judge'
import { barPositionAt, isTimed } from '../music/meter'
import { centsFromNearestNote, midiToFrequency, shiftByCents } from '../music/notes'
import type { Exercise } from '../music/types'
import { TELEMETRY_SCHEMA_VERSION, type NoteTelemetry, type TakeTelemetry } from './types'

/**
 * Builds the record of a take.
 *
 * These records are the material every future coach will read, so they hold
 * measurements and nothing else. "Played 32 ms late" belongs here; "rushing"
 * does not, because that is a reading of the measurement, and a better model
 * may read it differently.
 */

export interface TelemetryInput {
  exercise: Exercise
  judgments: NoteJudgment[]
  bpm: number | null
  latencyCorrectionMs: number
  learner: TakeTelemetry['learner']
  takeId: string
  now: Date
}

export function buildTelemetry(input: TelemetryInput): TakeTelemetry {
  const { exercise, judgments, bpm } = input

  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    takeId: input.takeId,
    recordedAt: input.now.toISOString(),
    exercise: {
      id: exercise.id,
      title: exercise.title,
      skills: [...exercise.skills],
      mode: exercise.mode,
      targetBpm: isTimed(exercise) ? exercise.targetBpm : null,
      timeSignature: exercise.timeSignature as unknown as [number, number],
      noteCount: exercise.notes.length,
    },
    bpm,
    latencyCorrectionMs: input.latencyCorrectionMs,
    score: scorePerformance(judgments, isTimed(exercise) ? 'timed' : 'untimed'),
    notes: judgments.map((judgment, index) => toNoteTelemetry(judgment, index, exercise)),
    learner: input.learner,
  }
}

function toNoteTelemetry(judgment: NoteJudgment, index: number, exercise: Exercise): NoteTelemetry {
  const { target, played } = judgment
  const startBeat = target?.startBeat ?? played?.beat ?? 0

  return {
    index,
    ...barPositionAt(startBeat, exercise.timeSignature, exercise.meterChanges),
    ...whatWasAsked(target),
    ...whatWasPlayed(played),
    timingErrorMs: judgment.timingErrorMs,
    semitoneError: judgment.semitoneError,
    verdict: judgment.verdict,
  }
}

/** A missing target means the learner played a note nothing asked for. */
function whatWasAsked(
  target: NoteJudgment['target'],
): Pick<NoteTelemetry, 'targetMidi' | 'string' | 'fret'> {
  if (!target) return { targetMidi: -1, string: null, fret: null }
  return {
    targetMidi: target.midi,
    string: target.position?.string ?? null,
    fret: target.position?.fret ?? null,
  }
}

/** A missing played note means the target was never sounded. */
function whatWasPlayed(
  played: NoteJudgment['played'],
): Pick<NoteTelemetry, 'playedMidi' | 'centsOffset' | 'level' | 'detection'> {
  if (!played || played.midi === null)
    return {
      playedMidi: null,
      centsOffset: null,
      level: played?.level ?? null,
      detection: played?.detection ?? null,
    }
  return {
    playedMidi: played.midi,
    centsOffset: centsOffsetOf(played.midi, played.cents),
    level: played.level,
    detection: played.detection ?? null,
  }
}

/**
 * The detector reports cents relative to the nearest note; this keeps that
 * figure but anchors it to the pitch actually identified, so a reader can tell
 * a note that was slightly flat from one that was a fret too low.
 */
function centsOffsetOf(playedMidi: number, reportedCents: number): number {
  const sounded = shiftByCents(midiToFrequency(playedMidi), reportedCents)
  return Number(centsFromNearestNote(sounded).cents.toFixed(1))
}
