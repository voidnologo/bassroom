import { DEMOTION_SCORE, nextRungBpm, PROMOTION_SCORE } from '../engine/tempoLadder'
import type {
  CoachFeedback,
  CoachProvider,
  CoachRequest,
  NextAction,
  NoteTelemetry,
  Observation,
  TakeTelemetry,
} from './types'

/**
 * Feedback from rules, with no model behind it.
 *
 * This is the default and the fallback: practice must never depend on a network
 * call. Each rule below names a specific, measurable mistake and says what to
 * do about it, which is most of what a beginner needs most of the time. The
 * model-backed coach exists for the things rules cannot see.
 */

/** A player cannot perceive their own timing error below roughly this. */
const AUDIBLE_OFFSET_MS = 25
/** Above this spread, the problem is steadiness rather than placement. */
const UNSTEADY_SPREAD_MS = 60
/** A note is "consistently" wrong when it fails this often across recent takes. */
const RECURRENCE_THRESHOLD = 0.6
/** Cents flat or sharp beyond this is a fretting-hand problem, not tuning drift. */
const INTONATION_CENTS = 25
/** Fewer attacks than this is too short a take to call anything a pattern. */
const ENOUGH_ATTACKS = 6
/**
 * Share of heard attacks with no readable pitch before it is worth saying so.
 * A quarter of a take is past what a stray muted note or a bad window explains.
 */
const UNNAMED_SHARE = 0.25

type Rule = (request: CoachRequest) => Observation | null

const rules: Rule[] = [
  dragOrRush,
  steadiness,
  wrongFret,
  wrongString,
  doublePlucking,
  droppedNotes,
  ringingStrings,
  intonation,
  unevenAttack,
  secondHalfDecay,
  recurringTroubleSpot,
]

export class HeuristicCoach implements CoachProvider {
  readonly id = 'heuristic-v1'
  readonly label = 'Built-in coach'

  async isAvailable(): Promise<boolean> {
    return true
  }

  async analyze(request: CoachRequest): Promise<CoachFeedback> {
    const observations = rules
      .map((rule) => rule(request))
      .filter((observation): observation is Observation => observation !== null)
      .sort(bySeverity)

    return {
      providerId: this.id,
      headline: headlineFor(request, observations),
      observations: observations.slice(0, 3),
      nextAction: nextActionFor(request, observations),
      confidence: observations.length === 0 ? 'medium' : 'high',
    }
  }
}

// --- rules -----------------------------------------------------------------

function dragOrRush({ telemetry }: CoachRequest): Observation | null {
  const { meanTimingErrorMs, timingSpreadMs } = telemetry.score
  if (Math.abs(meanTimingErrorMs) < AUDIBLE_OFFSET_MS) return null
  // A large spread means the notes are scattered, not uniformly displaced, and
  // the steadiness rule is the one that should speak.
  if (timingSpreadMs > UNSTEADY_SPREAD_MS) return null

  const direction = meanTimingErrorMs > 0 ? 'behind' : 'ahead of'
  return {
    id: 'timing-offset',
    severity: 'fix',
    statement: `Your notes land consistently ${direction} the click.`,
    evidence: `Average ${Math.abs(Math.round(meanTimingErrorMs))} ms ${direction} the beat, across ${telemetry.score.totalTargets} notes.`,
  }
}

function steadiness({ telemetry }: CoachRequest): Observation | null {
  if (telemetry.score.timingSpreadMs <= UNSTEADY_SPREAD_MS) return null
  return {
    id: 'timing-spread',
    severity: 'fix',
    statement: 'The notes are in roughly the right places but not evenly spaced.',
    evidence: `Timing varies by ${Math.round(telemetry.score.timingSpreadMs)} ms from note to note.`,
  }
}

function wrongFret({ telemetry }: CoachRequest): Observation | null {
  const offByOne = telemetry.notes.filter((note) => Math.abs(note.semitoneError ?? 0) === 1)
  if (offByOne.length < 2) return null
  const direction = (offByOne[0].semitoneError ?? 0) > 0 ? 'one fret too high' : 'one fret too low'
  return {
    id: 'fret-off-by-one',
    severity: 'fix',
    statement: `Several notes came out ${direction}.`,
    evidence: `${offByOne.length} notes a semitone out, first at ${describe(offByOne[0])}.`,
  }
}

function wrongString({ telemetry }: CoachRequest): Observation | null {
  const wrongOctave = telemetry.notes.filter(
    (note) => Math.abs(note.semitoneError ?? 0) % 12 === 0 && (note.semitoneError ?? 0) !== 0,
  )
  if (wrongOctave.length === 0) return null
  return {
    id: 'wrong-octave',
    severity: 'fix',
    statement: 'Some notes sounded an octave away from the one written.',
    evidence: `${wrongOctave.length} notes an octave out, first at ${describe(wrongOctave[0])}. Usually this is the wrong string.`,
  }
}

function doublePlucking({ telemetry }: CoachRequest): Observation | null {
  if (telemetry.score.extraNotes === 0) return null
  const ratio = telemetry.score.extraNotes / Math.max(1, telemetry.score.totalTargets)
  if (ratio < 0.1) return null
  return {
    id: 'extra-notes',
    severity: 'watch',
    statement: 'There were more notes than the exercise asked for.',
    evidence: `${telemetry.score.extraNotes} extra attacks. Often a string ringing on, or the plucking finger catching twice.`,
  }
}

function droppedNotes({ telemetry }: CoachRequest): Observation | null {
  if (telemetry.score.missedNotes === 0) return null
  const missed = telemetry.notes.filter((note) => note.verdict === 'missed')
  return {
    id: 'missed-notes',
    severity: telemetry.score.missedNotes > 2 ? 'fix' : 'watch',
    statement: `${telemetry.score.missedNotes} note${telemetry.score.missedNotes === 1 ? '' : 's'} did not sound.`,
    evidence: `First at ${describe(missed[0])}. ${silenceCause(missed)}`,
  }
}

/**
 * An open string has no fretting hand to blame, and saying so anyway sends a
 * beginner looking for a fault they cannot have made.
 */
function silenceCause(missed: NoteTelemetry[]): string {
  const allOpen = missed.every((note) => note.fret === 0)
  if (allOpen) {
    return 'On an open string that is the plucking finger missing it, or another finger resting on the string.'
  }
  return 'A note that does not ring is usually a fretting finger not quite behind the fret.'
}

/**
 * Attacks the detector heard but the pitch tracker could not name.
 *
 * Two strings sounding together have no common period, so the pitch detector
 * reports no period at all rather than a wrong one. That is a different fault
 * from playing nothing, and it has a different fix: damp what you are not
 * playing.
 */
function ringingStrings({ telemetry }: CoachRequest): Observation | null {
  const heard = telemetry.notes.filter((note) => note.detection !== null)
  if (heard.length < ENOUGH_ATTACKS) return null
  const unnamed = heard.filter((note) => note.detection?.frameCount === 0)
  if (unnamed.length / heard.length < UNNAMED_SHARE) return null
  return {
    id: 'ringing-strings',
    severity: 'fix',
    statement: 'The app heard you play, but could not tell which note.',
    evidence: `${unnamed.length} of ${heard.length} attacks had no readable pitch. Two strings ringing at once have no single pitch to find, so mute the ones you are not playing: rest the thumb on the E string.`,
  }
}

function intonation({ telemetry }: CoachRequest): Observation | null {
  const fretted = telemetry.notes.filter(
    (note) => note.centsOffset !== null && note.fret !== null && note.fret > 0,
  )
  if (fretted.length < 4) return null
  const mean = fretted.reduce((sum, note) => sum + (note.centsOffset ?? 0), 0) / fretted.length
  if (Math.abs(mean) < INTONATION_CENTS) return null

  const direction = mean > 0 ? 'sharp' : 'flat'
  const cause =
    mean > 0 ? 'pressing hard enough to bend the string' : 'the bass drifting out of tune'
  return {
    id: 'intonation',
    severity: 'watch',
    statement: `Fretted notes are sounding ${direction}.`,
    evidence: `Average ${Math.abs(Math.round(mean))} cents ${direction}. Check tuning first; after that, ${cause}.`,
  }
}

function unevenAttack({ telemetry }: CoachRequest): Observation | null {
  const levels = telemetry.notes
    .map((note) => note.level)
    .filter((level): level is number => level !== null && level > 0)
  if (levels.length < 6) return null
  const loudest = Math.max(...levels)
  const quietest = Math.min(...levels)
  if (loudest / quietest < 3) return null
  return {
    id: 'uneven-attack',
    severity: 'watch',
    statement: 'Some notes are much louder than others.',
    evidence: `Loudest attack is ${(loudest / quietest).toFixed(1)} times the quietest. Usually one plucking finger doing more work than the other.`,
  }
}

function secondHalfDecay({ telemetry }: CoachRequest): Observation | null {
  const graded = telemetry.notes.filter((note) => note.targetMidi >= 0)
  if (graded.length < 12) return null
  const middle = Math.floor(graded.length / 2)
  const first = accuracyOf(graded.slice(0, middle))
  const second = accuracyOf(graded.slice(middle))
  if (first - second < 0.25) return null
  return {
    id: 'fades-late',
    severity: 'watch',
    statement: 'The take started better than it finished.',
    evidence: `${Math.round(first * 100)}% correct in the first half, ${Math.round(second * 100)}% in the second. Tension builds; shake the hand out and start again.`,
  }
}

/**
 * Keyed on where the note sits in the music, not on its index in the judgment
 * list. That list includes extra attacks, so one stray double-pluck shifts
 * every later index and the same musical note is counted as two different
 * places.
 */
function placeKey(note: NoteTelemetry): string {
  return `${note.bar}:${note.beatInBar}`
}

function countTroubleByPlace(takes: TakeTelemetry[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const take of takes) {
    const missed = take.notes.filter(
      (note) => note.targetMidi >= 0 && note.verdict !== 'perfect' && note.verdict !== 'good',
    )
    for (const note of missed) counts.set(placeKey(note), (counts.get(placeKey(note)) ?? 0) + 1)
  }
  return counts
}

function recurringTroubleSpot({ telemetry, recentTakes }: CoachRequest): Observation | null {
  if (recentTakes.length < 2) return null
  const takes = [telemetry, ...recentTakes].slice(0, 4)
  const counts = countTroubleByPlace(takes)

  const worst = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (!worst || worst[1] / takes.length < RECURRENCE_THRESHOLD) return null

  const note = telemetry.notes.find((candidate) => placeKey(candidate) === worst[0])
  if (!note) return null
  return {
    id: 'recurring-spot',
    severity: 'fix',
    statement: 'The same spot is going wrong every time.',
    evidence: `${describe(note)} has missed in ${worst[1]} of the last ${takes.length} takes. Loop that bar on its own.`,
  }
}

// --- assembly --------------------------------------------------------------

function headlineFor(request: CoachRequest, observations: Observation[]): string {
  const { overall } = request.telemetry.score
  // The headline must not contradict what is printed directly beneath it, so a
  // high score only reads as clean when nothing was actually found.
  if (overall >= 95 && observations.length === 0) {
    return 'Clean. That is what it is meant to sound like.'
  }
  if (observations.length === 0 && overall >= PROMOTION_SCORE) return 'Solid take. Nothing to fix.'
  if (observations.length === 0)
    return 'Nothing specific went wrong. More repetitions at this tempo.'
  return observations[0].statement
}

function nextActionFor(request: CoachRequest, observations: Observation[]): NextAction {
  const { telemetry } = request
  const recurring = observations.find((observation) => observation.id === 'recurring-spot')
  if (recurring) {
    // Reuse the bar the observation named. Recomputing it found the first bad
    // note of this take instead, so the two lines could point at different bars.
    const bar = barFrom(recurring.evidence) ?? worstNote(telemetry)?.bar ?? 1
    return {
      kind: 'isolate',
      detail: `Loop bar ${bar} on its own until it stops being the hard part.`,
    }
  }

  if (telemetry.score.overall < DEMOTION_SCORE) {
    return {
      kind: 'slow-down',
      detail: `Drop to ${Math.round(telemetry.bpm * 0.9)} bpm. Accuracy first; the speed comes back on its own.`,
      bpm: Math.round(telemetry.bpm * 0.9),
    }
  }

  if (telemetry.score.overall >= PROMOTION_SCORE && telemetry.bpm < telemetry.exercise.targetBpm) {
    const nextBpm = Math.min(telemetry.exercise.targetBpm, nextRungBpm(telemetry.bpm))
    return {
      kind: 'speed-up',
      detail: `Clean enough to move up a step. Take it again at ${nextBpm} bpm.`,
      bpm: nextBpm,
    }
  }

  if (telemetry.score.overall >= PROMOTION_SCORE) {
    return { kind: 'switch-exercise', detail: 'That is this one done at full tempo. Move on.' }
  }

  return { kind: 'repeat', detail: 'Run it again at this tempo. One thing at a time.' }
}

/** Pull the bar number back out of the evidence line that named it. */
function barFrom(evidence: string): number | null {
  const match = /bar (\d+)/.exec(evidence)
  return match ? Number(match[1]) : null
}

function worstNote(telemetry: TakeTelemetry): NoteTelemetry | undefined {
  return telemetry.notes.find((note) => note.verdict !== 'perfect' && note.verdict !== 'good')
}

function accuracyOf(notes: NoteTelemetry[]): number {
  if (notes.length === 0) return 1
  const good = notes.filter((note) => note.verdict === 'perfect' || note.verdict === 'good')
  return good.length / notes.length
}

function describe(note: NoteTelemetry | undefined): string {
  if (!note) return 'an unknown spot'
  return `bar ${note.bar}, beat ${note.beatInBar}`
}

const SEVERITY_ORDER = { fix: 0, watch: 1, info: 2 }

function bySeverity(a: Observation, b: Observation): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
}
