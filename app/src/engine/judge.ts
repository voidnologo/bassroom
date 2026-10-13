import type { TargetNote } from '../music/types'

export type Verdict = 'perfect' | 'good' | 'early' | 'late' | 'wrong-pitch' | 'missed' | 'extra'

export interface PlayedNote {
  /** Body-beat position derived from the onset, already latency-corrected. */
  beat: number
  /** Detected pitch, or null when the pluck produced no usable pitch. */
  midi: number | null
  /** Cents from the detected pitch's own nearest note (intonation, not error). */
  cents: number
  /** Peak level of the attack, 0..1. Used to spot uneven plucking. */
  level: number
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
      })
      continue
    }

    claimed.add(bestIndex)
    const target = targets[bestIndex]
    const timingErrorMs = (note.beat - target.startBeat) * beatMs
    const semitoneError = note.midi === null ? null : note.midi - target.midi

    judgments.push({
      targetIndex: bestIndex,
      target,
      played: note,
      verdict: verdictFor(semitoneError, timingErrorMs, windows),
      timingErrorMs,
      semitoneError,
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
    })
  })

  return judgments.sort((a, b) => orderKey(a) - orderKey(b))
}

function verdictFor(
  semitoneError: number | null,
  timingErrorMs: number,
  windows: TimingWindows,
): Verdict {
  if (semitoneError === null || semitoneError !== 0) return 'wrong-pitch'
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
  /** Fraction of target notes landing inside the "good" window, 0..1. */
  timingAccuracy: number
  /** Mean signed timing error in ms. Positive means dragging. */
  meanTimingErrorMs: number
  /** Standard deviation of timing error in ms: the consistency measure. */
  timingSpreadMs: number
  /** Notes played that no target claimed. */
  extraNotes: number
  missedNotes: number
  wrongPitchNotes: number
  totalTargets: number
  /** Combined 0..100 figure used for stars, XP, and the tempo ladder. */
  overall: number
}

export function scorePerformance(judgments: NoteJudgment[]): PerformanceScore {
  const targeted = judgments.filter((judgment) => judgment.target !== null)
  const total = targeted.length || 1

  const correctPitch = targeted.filter(
    (judgment) => judgment.verdict !== 'missed' && judgment.semitoneError === 0,
  )
  const inTime = targeted.filter(
    (judgment) => judgment.verdict === 'perfect' || judgment.verdict === 'good',
  )
  const errors = targeted
    .map((judgment) => judgment.timingErrorMs)
    .filter((value): value is number => value !== null)

  const meanTimingErrorMs = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : 0
  const variance = errors.length
    ? errors.reduce((sum, value) => sum + (value - meanTimingErrorMs) ** 2, 0) / errors.length
    : 0

  const pitchAccuracy = correctPitch.length / total
  const timingAccuracy = inTime.length / total
  const extraNotes = judgments.filter((judgment) => judgment.verdict === 'extra').length

  // Pitch is weighted above timing because playing the wrong note is a
  // different kind of mistake from playing the right note slightly late, and
  // extra notes are penalised separately so that flailing cannot score well.
  const extraPenalty = Math.min(0.25, (extraNotes / total) * 0.5)
  const overall = Math.max(
    0,
    Math.round((pitchAccuracy * 0.6 + timingAccuracy * 0.4 - extraPenalty) * 100),
  )

  return {
    pitchAccuracy,
    timingAccuracy,
    meanTimingErrorMs,
    timingSpreadMs: Math.sqrt(variance),
    extraNotes,
    missedNotes: targeted.filter((judgment) => judgment.verdict === 'missed').length,
    wrongPitchNotes: targeted.filter((judgment) => judgment.verdict === 'wrong-pitch').length,
    totalTargets: targeted.length,
    overall,
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
