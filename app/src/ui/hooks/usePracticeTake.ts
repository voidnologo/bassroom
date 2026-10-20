import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PitchFrame } from '../../audio/contracts'

import { buildTelemetry } from '../../coach'
import type { CoachFeedback, TakeTelemetry } from '../../coach/types'
import type { Verdict } from '../../engine/judge'
import {
  PracticeSession,
  expandRepeats,
  type SessionPhase,
  type SessionResult,
} from '../../engine/PracticeSession'
import { barPositionAt } from '../../music/meter'
import type { Exercise, TargetNote } from '../../music/types'
import { levelFor } from '../../progress/gamification'
import type { AttemptResult } from '../../progress/reducer'
import type { SelfEstimate } from '../../progress/types'
import { useAudio } from '../../state/AudioProvider'
import { scaleExerciseIdsFrom, useProgressStore } from '../../state/progressStore'
import { useDiagnosticsRecorder, type DiagnosticsHandle } from './useDiagnosticsRecorder'
import { ALL_EXERCISES } from '../../content/curriculum'
import type { ProgressSnapshot } from '../../progress/types'

/**
 * Wires one exercise to the audio engine, the scoring engine, progress, and the
 * coach, and exposes what the practice screen needs in order to draw.
 *
 * Fast-moving values - the current beat, the live pitch, verdicts as they land -
 * are kept in refs and read by the canvas each frame. Only things that change a
 * few times per take go through React state.
 */

export interface TakeState {
  phase: SessionPhase
  heard: PitchFrame | null
  /**
   * Set when a take has finished but its result is being withheld until the
   * learner has said how they think it went. The interval must stay empty:
   * filling it with the score, or with anything else, removes the benefit.
   */
  awaitingEstimate: boolean
  /** Call-and-response only: which prompt the learner is on. */
  promptIndex: number
  beatInBar: number
  /**
   * Index of the note to show next. Published on a timer rather than read from
   * the beat ref during render: nothing re-renders when the beat advances, so a
   * ref read meant the target froze whenever the learner stopped playing.
   */
  targetIndex: number
  lastResult: SessionResult | null
  lastAttempt: AttemptResult | null
  feedback: CoachFeedback | null
  coachPending: boolean
}

type SetTake = React.Dispatch<React.SetStateAction<TakeState>>
type Engine = ReturnType<typeof useAudio>['engine']
type Coach = ReturnType<typeof useAudio>['coach']

const initialState: TakeState = {
  phase: 'idle',
  heard: null,
  awaitingEstimate: false,
  promptIndex: 0,
  beatInBar: 0,
  targetIndex: 0,
  lastResult: null,
  lastAttempt: null,
  feedback: null,
  coachPending: false,
}

/** How often the live pitch readout may re-render, in milliseconds. */
const PITCH_READOUT_INTERVAL_MS = 120

export interface TakeOptions {
  /** Hide every live cue and mark the take as a retention probe. */
  isProbe: boolean
  /** Ask the learner to read their own timing before showing them the result. */
  askForEstimate: boolean
}

export function usePracticeTake(exercise: Exercise, bpm: number, options: TakeOptions) {
  const { engine, coach, state: engineState } = useAudio()
  const snapshot = useProgressStore((store) => store.snapshot)

  const beatRef = useRef(0)
  const verdictsRef = useRef(new Map<number, Verdict>())
  const sessionRef = useRef<PracticeSession | null>(null)
  const frameRef = useRef(0)

  const [take, setTake] = useState<TakeState>(initialState)
  const pendingRef = useRef<SessionResult | null>(null)
  const [targets, setAsked] = useAskedTargets(exercise)
  const diagnostics = useDiagnosticsRecorder(engine, snapshot.profile.diagnosticsEnabled)
  const complete = useTakeCompletion({
    exercise,
    coach,
    snapshot,
    setTake,
    verdictsRef,
    options,
    diagnostics,
  })

  /**
   * A take either completes straight away, or waits for the learner's estimate
   * first. Nothing about the result reaches the screen until they have answered.
   */
  const finish = useCallback(
    (result: SessionResult) => {
      if (!options.askForEstimate) {
        complete(result, null)
        return
      }
      pendingRef.current = result
      setTake((current) => ({ ...current, awaitingEstimate: true }))
    },
    [complete, options.askForEstimate],
  )

  const submitEstimate = useCallback(
    (estimate: SelfEstimate) => {
      const result = pendingRef.current
      pendingRef.current = null
      setTake((current) => ({ ...current, awaitingEstimate: false }))
      if (result) complete(result, estimate)
    },
    [complete],
  )

  const start = useStartTake({
    engine,
    exercise,
    bpm,
    latencyMs: snapshot.profile.inputLatencyMs,
    complete,
    finish,
    diagnostics,
    refs: { sessionRef, pendingRef, verdictsRef, beatRef },
    setTake,
    onTargets: setAsked,
  })

  const stop = useCallback(() => {
    sessionRef.current?.stop()
    sessionRef.current = null
  }, [])

  useEffect(() => () => sessionRef.current?.dispose(), [])

  useAbandonOnInputLoss(engine, sessionRef)
  useBeatClock({
    engine,
    sessionRef,
    beatRef,
    frameRef,
    exercise,
    targets,
    setTake,
  })
  usePitchReadout(engine, setTake)

  return {
    take,
    targets,
    beatRef,
    verdictsRef,
    start,
    stop,
    submitEstimate,
    ready: engineState === 'running',
  }
}

/**
 * The notes the take on screen is asking for.
 *
 * The order is the session's to choose - a drill may reshuffle it every take -
 * so the written order is only what is drawn until a take has said otherwise.
 */
function useAskedTargets(exercise: Exercise): [TargetNote[], (targets: TargetNote[]) => void] {
  const written: TargetNote[] = useMemo(() => expandRepeats(exercise), [exercise])
  const [asked, setAsked] = useState<TargetNote[] | null>(null)
  useEffect(() => setAsked(null), [exercise])
  return [asked ?? written, setAsked]
}

interface CompletionOptions {
  exercise: Exercise
  coach: Coach
  snapshot: ProgressSnapshot
  setTake: SetTake
  verdictsRef: React.MutableRefObject<Map<number, Verdict>>
  options: TakeOptions
  diagnostics: DiagnosticsHandle
}

/**
 * Everything that happens when a take ends: record it, store the telemetry, and
 * ask the coach. Kept apart from the session wiring because it is the part that
 * touches four other subsystems.
 */
function useTakeCompletion(
  completion: CompletionOptions,
): (result: SessionResult, estimate: SelfEstimate | null) => void {
  const { exercise, coach, snapshot, setTake, verdictsRef, options, diagnostics } = completion
  const recordAttempt = useProgressStore((store) => store.recordAttempt)
  const recentTakesRef = useRef<TakeTelemetry[]>([])

  const askCoach = useCallback(
    async (result: SessionResult, attempt: AttemptResult) => {
      const progress = snapshot.exercises[exercise.id]
      const telemetry = buildTelemetry({
        exercise,
        judgments: result.judgments,
        bpm: result.bpm,
        latencyCorrectionMs: snapshot.profile.inputLatencyMs,
        takeId: `${exercise.id}-${Date.parse(attempt.attempt.completedAt)}`,
        now: new Date(),
        learner: {
          level: levelFor(snapshot.profile.xp),
          totalAttempts: snapshot.history.length,
          attemptsOnThisExercise: progress?.attempts ?? 0,
          bestStarsOnThisExercise: progress?.bestStars ?? 0,
          daysSinceFirstPractice: daysSince(snapshot.profile.createdAt),
        },
      })

      void recordTake(telemetry)
      diagnostics.flush({
        kind: 'take',
        now: new Date(),
        takeId: telemetry.takeId,
        exerciseId: exercise.id,
        bpm: telemetry.bpm,
        latencyCorrectionMs: telemetry.latencyCorrectionMs,
      })
      const feedback = await coach.analyze({
        telemetry,
        recentTakes: recentTakesRef.current,
      })
      recentTakesRef.current = [telemetry, ...recentTakesRef.current].slice(0, 5)
      setTake((current) => ({ ...current, feedback, coachPending: false }))
    },
    [coach, diagnostics, exercise, setTake, snapshot],
  )

  return useCallback(
    (result: SessionResult, selfEstimate: SelfEstimate | null) => {
      for (const judgment of result.judgments) {
        if (judgment.targetIndex !== null) {
          verdictsRef.current.set(judgment.targetIndex, judgment.verdict)
        }
      }

      const attempt = recordAttempt({
        exercise,
        score: result.score,
        bpm: result.bpm,
        durationSeconds: result.durationSeconds,
        scaleExerciseIds: scaleExerciseIdsFrom(ALL_EXERCISES),
        isProbe: options.isProbe,
        abandoned: result.abandoned,
        selfEstimate,
      })

      setTake((current) => ({
        ...current,
        lastResult: result,
        lastAttempt: attempt,
        coachPending: true,
      }))
      void askCoach(result, attempt)
    },
    [askCoach, exercise, options.isProbe, recordAttempt, setTake, verdictsRef],
  )
}

interface BeatClockOptions {
  engine: Engine
  sessionRef: React.MutableRefObject<PracticeSession | null>
  beatRef: React.MutableRefObject<number>
  frameRef: React.MutableRefObject<number>
  exercise: Exercise
  targets: TargetNote[]
  setTake: SetTake
}

/**
 * Advances the beat position every frame from the audio clock, and publishes
 * only the beat within the bar to React, which changes a few times a second
 * rather than sixty.
 */
function useBeatClock(options: BeatClockOptions): void {
  const { engine, sessionRef, beatRef, frameRef, exercise, targets, setTake } = options
  useEffect(() => {
    const tick = (): void => {
      const clock = sessionRef.current?.getTimeKeeper()
      // Only while a clock exists: the loop used to run for the whole life of
      // the screen whether or not a take was in progress.
      if (!clock) {
        frameRef.current = 0
        return
      }
      beatRef.current = clock.timeToBodyBeat(engine.now())
      frameRef.current = requestAnimationFrame(tick)
    }

    const publish = (): void => {
      if (sessionRef.current?.getTimeKeeper() && frameRef.current === 0) {
        frameRef.current = requestAnimationFrame(tick)
      }
      const beat = beatRef.current
      const inBar =
        beat < 0
          ? countInPosition(beat, exercise)
          : barPositionAt(beat, exercise.timeSignature, exercise.meterChanges).beatInBar - 1
      const found = targets.findIndex((note) => note.startBeat >= beat - 0.2)
      const next = found === -1 ? Math.max(0, targets.length - 1) : found
      setTake((current) =>
        current.beatInBar === inBar && current.targetIndex === next
          ? current
          : { ...current, beatInBar: inBar, targetIndex: next },
      )
    }

    const beatTimer = window.setInterval(publish, 40)
    return () => {
      cancelAnimationFrame(frameRef.current)
      window.clearInterval(beatTimer)
    }
  }, [engine, sessionRef, beatRef, frameRef, exercise, targets, setTake])
}

/** Throttles the live pitch display; the detector produces about 47 readings a second. */
function usePitchReadout(engine: Engine, setTake: SetTake): void {
  useEffect(() => {
    let lastShown = 0
    return engine.onPitch((frame) => {
      const now = performance.now()
      if (now - lastShown < PITCH_READOUT_INTERVAL_MS) return
      lastShown = now
      setTake((current) => ({ ...current, heard: frame.midi === null ? null : frame }))
    })
  }, [engine, setTake])
}

/**
 * Best effort: a failed write must never interrupt practice. It is still worth
 * knowing about, because a static server answers /api with the app's own HTML
 * and that is a 200 - so without checking, every take looks recorded and none
 * of them is.
 */
async function recordTake(telemetry: TakeTelemetry): Promise<boolean> {
  try {
    const response = await fetch('/api/takes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(telemetry),
    })
    if (!response.ok) return false
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null && 'recorded' in body
  } catch {
    return false
  }
}

function daysSince(isoDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000))
}

interface StartTakeOptions {
  engine: Engine
  exercise: Exercise
  bpm: number
  latencyMs: number
  complete: (result: SessionResult, estimate: SelfEstimate | null) => void
  finish: (result: SessionResult) => void
  diagnostics: DiagnosticsHandle
  refs: {
    sessionRef: React.MutableRefObject<PracticeSession | null>
    pendingRef: React.MutableRefObject<SessionResult | null>
    verdictsRef: React.MutableRefObject<Map<number, Verdict>>
    beatRef: React.MutableRefObject<number>
  }
  setTake: SetTake
  /** Publishes the order the session settled on, which may not be the written one. */
  onTargets: (targets: TargetNote[]) => void
}

/**
 * `atBpm` is optional, but an event handler must not be wired to the result
 * directly: React would pass the click event as the tempo.
 */
function useStartTake(options: StartTakeOptions): (atBpm?: number) => void {
  const { engine, exercise, bpm, latencyMs, complete, finish, diagnostics, refs } = options
  const { setTake, onTargets } = options
  const { sessionRef, pendingRef, verdictsRef, beatRef } = refs

  return useCallback(
    (atBpm?: number) => {
      const takeBpm = typeof atBpm === 'number' && Number.isFinite(atBpm) ? atBpm : bpm
      // A take left waiting for an estimate is finished but unrecorded; starting
      // another would drop it silently. Record it with no estimate instead.
      const unrated = pendingRef.current
      pendingRef.current = null
      if (unrated) complete(unrated, null)
      diagnostics.begin()

      sessionRef.current?.dispose()
      engine.resetAnalysis()
      verdictsRef.current = new Map()
      beatRef.current = -exercise.countInBars * exercise.timeSignature[0]
      setTake({ ...initialState, phase: 'count-in' })

      const session = buildSession({ engine, latencyMs, beatRef, setTake, onFinish: finish })
      sessionRef.current = session
      session.start(exercise, takeBpm)
      onTargets(session.currentTargets)
    },
    [
      bpm,
      complete,
      diagnostics,
      engine,
      exercise,
      finish,
      latencyMs,
      beatRef,
      onTargets,
      pendingRef,
      sessionRef,
      setTake,
      verdictsRef,
    ],
  )
}

function buildSession(options: {
  engine: Engine
  latencyMs: number
  beatRef: React.MutableRefObject<number>
  setTake: SetTake
  onFinish: (result: SessionResult) => void
}): PracticeSession {
  const { engine, latencyMs, beatRef, setTake, onFinish } = options
  return new PracticeSession({
    input: engine,
    createTimeKeeper: () => engine.createTimeKeeper(),
    latencyMs,
    callbacks: {
      onPhase: (phase) => setTake((current) => ({ ...current, phase })),
      // A call-and-response take has no clock, so the prompt is the only thing
      // that moves. Without this the beat ref sits on the count-in for the
      // whole take and the chart marks every note as still ahead.
      onPrompt: (note, index) => {
        beatRef.current = note.startBeat
        setTake((current) => ({ ...current, promptIndex: index }))
      },
      onFinish,
    },
  })
}

/**
 * A take whose input has gone away will never reach its last beat, so it has to
 * be ended here rather than waiting for a clock that has stopped advancing.
 */
function useAbandonOnInputLoss(
  engine: Engine,
  sessionRef: React.MutableRefObject<PracticeSession | null>,
): void {
  useEffect(
    () =>
      engine.onUnavailable(() => {
        sessionRef.current?.stop()
        sessionRef.current = null
      }),
    [engine, sessionRef],
  )
}

/** During the count-in the beat is negative, so it is counted from the downbeat. */
function countInPosition(beat: number, exercise: Exercise): number {
  const beatsPerBar = exercise.timeSignature[0]
  return ((Math.floor(beat) % beatsPerBar) + beatsPerBar) % beatsPerBar
}
