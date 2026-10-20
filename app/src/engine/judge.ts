import type { TargetNote } from '../music/types'

/**
 * `unpitched` is an attack that was heard and carried no single readable
 * pitch - two strings ringing together have no common period, so the detector
 * finds none rather than finding the wrong one. It is deliberately not
 * `wrong-pitch`: the app has not established that the note was wrong, only
 * that it cannot say what the note was.
 */
export type Verdict =
  'perfect' | 'good' | 'early' | 'late' | 'wrong-pitch' | 'unpitched' | 'missed' | 'extra'

/**
 * Whether the take being judged was played against a clock.
 *
 * A call-and-response take is not: it waits for the right pitch for as long as
 * the learner needs, and records each note at the beat it was asked for. Its
 * notes therefore have no timing error to find, and a figure produced from
 * them would describe the recording rather than the playing.
 *
 * Defaults to `timed` wherever it is optional, which is every exercise with a
 * metronome. `src/music/meter.ts::isTimed` is what decides this for an
 * exercise; nothing else should infer it.
 */
export type TakeClock = 'timed' | 'untimed'

export interface PlayedNote {
  /** Body-beat position derived from the onset, already latency-corrected. */
  beat: number
  /** Detected pitch, or null when the pluck produced no usable pitch. */
  midi: number | null
  /** Cents from the detected pitch's own nearest note (intonation, not error). */
  cents: number
  /** Peak level of the attack, 0..1. Used to spot uneven plucking. */
  level: number
  /** Detector measurements kept for tuning against a real instrument. */
  detection?: DetectionDetail
}

/**
 * What the detector was working with when it produced this note. Carried so a
 * take played on a real bass can be read back against the constants that were
 * tuned on synthesised plucks.
 */
export interface DetectionDetail {
  /** Amplitude ratio over the reference envelope at the attack. */
  riseRatio: number
  /** Fraction of usable frames that agreed on the pitch, 0..1. */
  agreement: number
  frameCount: number
  /** Mean YIN clarity behind the chosen pitch, 0..1. */
  clarity: number
}

export interface NoteJudgment {
  targetIndex: number | null
  target: TargetNote | null
  played: PlayedNote | null
  verdict: Verdict
  /** Signed timing error in milliseconds. Negative is early. */
  timingErrorMs: number | null
  /** Signed pitch error in semitones. */
  semitoneError: number | null
  /**
   * Whether the attack landed inside the "good" window, decided without
   * reference to the pitch. Null when nothing was played, and null throughout
   * an untimed take. Timing is knowable for an attack whose pitch is not, and
   * conflating the two was telling a player who plucked on the beat that they
   * had played a wrong note.
   */
  inTime: boolean | null
}

export interface TimingWindows {
  perfectMs: number
  goodMs: number
  matchMs: number
}

/**
 * Timing windows scale with tempo but are clamped at both ends. A fixed window
 * is unfairly tight at 40 bpm and meaninglessly loose at 160; a pure fraction
 * of a beat becomes impossible at fast tempos for a beginner.
 */
export function windowsForTempo(bpm: number): TimingWindows {
  const beatMs = 60000 / bpm
  return {
    perfectMs: clamp(beatMs * 0.12, 55, 120),
    goodMs: clamp(beatMs * 0.25, 110, 240),
    matchMs: clamp(beatMs * 0.5, 180, 400),
  }
}

/**
 * Pair detected notes with the notes the exercise asked for.
 *
 * Greedy nearest-match rather than full alignment: a beginner's stream has
 * extra notes, missing notes and large timing errors all at once, and a global
 * alignment would silently "explain away" a dropped note by shifting everything
 * after it, which is exactly the mistake worth surfacing.
 */
export function judgePerformance(
  targets: TargetNote[],
  played: PlayedNote[],
  bpm: number,
  clock: TakeClock = 'timed',
): NoteJudgment[] {
  const windows = windowsForTempo(bpm)
  const beatMs = 60000 / bpm
  const judgments: NoteJudgment[] = []
  const claimed = new Set<number>()

  const byDistance = played
    .map((note, index) => ({ note, index }))
    .sort((a, b) => a.note.beat - b.note.beat)

  for (const { note } of byDistance) {
    let bestIndex = -1
    let bestDistanceMs = Infinity
    targets.forEach((target, index) => {
      if (claimed.has(index)) return
      const distanceMs = Math.abs(note.beat - target.startBeat) * beatMs
      if (distanceMs < bestDistanceMs) {
        bestDistanceMs = distanceMs
        bestIndex = index
      }
    })

    if (bestIndex === -1 || bestDistanceMs > windows.matchMs) {
      judgments.push({
        targetIndex: null,
        target: null,
        played: note,
        verdict: 'extra',
        timingErrorMs: null,
        semitoneError: null,
        inTime: null,
      })
      continue
    }

    claimed.add(bestIndex)
    const target = targets[bestIndex]
    const timingErrorMs = (note.beat - target.startBeat) * beatMs
    const semitoneError = note.midi === null ? null : note.midi - target.midi
    const measured = clock === 'timed'

    judgments.push({
      targetIndex: bestIndex,
      target,
      played: note,
      verdict: verdictFor(semitoneError, timingErrorMs, windows, clock),
      timingErrorMs: measured ? timingErrorMs : null,
      semitoneError,
      inTime: measured ? Math.abs(timingErrorMs) <= windows.goodMs : null,
    })
  }

  targets.forEach((target, index) => {
    if (claimed.has(index)) return
    judgments.push({
      targetIndex: index,
      target,
      played: null,
      verdict: 'missed',
      timingErrorMs: null,
      semitoneError: null,
      inTime: null,
    })
  })

  return judgments.sort((a, b) => orderKey(a) - orderKey(b))
}

function verdictFor(
  semitoneError: number | null,
  timingErrorMs: number,
  windows: TimingWindows,
  clock: TakeClock,
): Verdict {
  if (semitoneError === null) return 'unpitched'
  if (semitoneError !== 0) return 'wrong-pitch'
  // Nothing placed the note in time, so the right pitch is the whole verdict.
  if (clock === 'untimed') return 'perfect'
  const magnitude = Math.abs(timingErrorMs)
  if (magnitude <= windows.perfectMs) return 'perfect'
  if (magnitude <= windows.goodMs) return 'good'
  return timingErrorMs < 0 ? 'early' : 'late'
}

function orderKey(judgment: NoteJudgment): number {
  if (judgment.target) return judgment.target.startBeat
  return judgment.played ? judgment.played.beat : 0
}

export interface PerformanceScore {
  /** Fraction of target notes played at the right pitch, 0..1. */
  pitchAccuracy: number
  /**
   * Fraction of target notes landing inside the "good" window, 0..1. The three
   * timing figures are null together, throughout a take with no clock: there
   * was nothing to be in time with, so there is no figure to report.
   */
  timingAccuracy: number | null
  /** Mean signed timing error in ms. Positive means dragging. */
  meanTimingErrorMs: number | null
  /** Standard deviation of timing error in ms: the consistency measure. */
  timingSpreadMs: number | null
  /** Notes played that no target claimed. */
  extraNotes: number
  missedNotes: number
  wrongPitchNotes: number
  /** Attacks heard whose pitch could not be read. Scored neither way. */
  unnamedNotes: number
  totalTargets: number
  /** Combined 0..100 figure used for stars, XP, and the tempo ladder. */
  overall: number
}

const PITCH_WEIGHT = 0.6
const TIMING_WEIGHT = 0.4

export function scorePerformance(
  judgments: NoteJudgment[],
  clock: TakeClock = 'timed',
): PerformanceScore {
  const targeted = judgments.filter((judgment) => judgment.target !== null)
  const total = targeted.length || 1

  const correctPitch = targeted.filter(
    (judgment) => judgment.verdict !== 'missed' && judgment.semitoneError === 0,
  )
  // An attack whose pitch could not be read is left out of the pitch figure
  // altogether: the app has said it does not know, so it can neither credit
  // the note nor count it wrong.
  const nameable = targeted.filter((judgment) => judgment.verdict !== 'unpitched')

  const pitchAccuracy = nameable.length === 0 ? 0 : correctPitch.length / nameable.length
  const timing = clock === 'timed' ? timingFiguresOf(targeted) : NOTHING_TIMED
  const extraNotes = judgments.filter((judgment) => judgment.verdict === 'extra').length

  const extraPenalty = Math.min(0.25, (extraNotes / total) * 0.5)
  const accuracy = timing.timingAccuracy
  const judged =
    accuracy === null ? pitchAccuracy : blend(pitchAccuracy, accuracy, nameable.length / total)
  const overall = Math.max(0, Math.round((judged - extraPenalty) * 100))

  return {
    pitchAccuracy,
    ...timing,
    extraNotes,
    missedNotes: targeted.filter((judgment) => judgment.verdict === 'missed').length,
    wrongPitchNotes: targeted.filter((judgment) => judgment.verdict === 'wrong-pitch').length,
    unnamedNotes: targeted.length - nameable.length,
    totalTargets: targeted.length,
    overall,
  }
}

/**
 * The timing half of a score. Kept together so that it is produced in one place
 * and either all of it is there or none of it is, rather than each caller
 * working out which of the three figures it may trust.
 */
type TimingFigures = Pick<
  PerformanceScore,
  'timingAccuracy' | 'meanTimingErrorMs' | 'timingSpreadMs'
>

const NOTHING_TIMED: TimingFigures = {
  timingAccuracy: null,
  meanTimingErrorMs: null,
  timingSpreadMs: null,
}

function timingFiguresOf(targeted: NoteJudgment[]): TimingFigures {
  const total = targeted.length || 1
  const inTime = targeted.filter((judgment) => judgment.inTime === true)
  const errors = targeted
    .map((judgment) => judgment.timingErrorMs)
    .filter((value): value is number => value !== null)

  const meanTimingErrorMs = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : 0
  const variance = errors.length
    ? errors.reduce((sum, value) => sum + (value - meanTimingErrorMs) ** 2, 0) / errors.length
    : 0
  return {
    timingAccuracy: inTime.length / total,
    meanTimingErrorMs,
    timingSpreadMs: Math.sqrt(variance),
  }
}

/**
 * Pitch is weighted above timing because playing the wrong note is a different
 * kind of mistake from playing the right note slightly late.
 *
 * `nameableShare` is how much of the take the app could actually read, and
 * pitch carries only that much of the score: a take it could name nothing in
 * is scored on its timing rather than on an accuracy figure standing in for an
 * unanswered question.
 */
function blend(pitchAccuracy: number, timingAccuracy: number, nameableShare: number): number {
  const pitchWeight = PITCH_WEIGHT * nameableShare
  return (
    (pitchAccuracy * pitchWeight + timingAccuracy * TIMING_WEIGHT) / (pitchWeight + TIMING_WEIGHT)
  )
}

/**
 * Notes the take actually produced: targets that were matched, plus notes no
 * target claimed. `totalTargets` is what was asked for, which is not the same
 * thing and is zero evidence of playing.
 */
export function notesPlayed(score: PerformanceScore): number {
  return score.totalTargets - score.missedNotes + score.extraNotes
}

/**
 * True when the take ran its full length and the detector heard nothing. Such a
 * take is not evidence of playing, in the same way an abandoned one is not, and
 * crediting it makes the streak maintainable by pressing start and walking away.
 */
export function nothingWasPlayed(score: PerformanceScore): boolean {
  return score.totalTargets > 0 && notesPlayed(score) === 0
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
