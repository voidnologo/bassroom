import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PitchFrame } from '../../audio/AudioEngine'
import { buildTelemetry } from '../../coach'
import type { CoachFeedback, TakeTelemetry } from '../../coach/types'
import type { Verdict } from '../../engine/judge'
import {
  PracticeSession,
  expandRepeats,
  type SessionPhase,
  type SessionResult,
} from '../../engine/PracticeSession'
import type { Exercise, TargetNote } from '../../music/types'
import { levelFor } from '../../progress/gamification'
import type { AttemptResult } from '../../progress/reducer'
import type { SelfEstimate } from '../../progress/types'
import { useAudio } from '../../state/AudioProvider'
import { scaleExerciseIdsFrom, useProgressStore } from '../../state/progressStore'
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
  const targets: TargetNote[] = useMemo(() => expandRepeats(exercise), [exercise])
  const complete = useTakeCompletion({ exercise, coach, snapshot, setTake, verdictsRef, options })

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

  const start = useCallback(() => {
    verdictsRef.current = new Map()
    beatRef.current = -exercise.countInBars * exercise.timeSignature[0]
    setTake({ ...initialState, phase: 'count-in' })

    const session = new PracticeSession(
      engine,
      {
        onPhase: (phase) => setTake((current) => ({ ...current, phase })),
        onPrompt: (_note, index) => setTake((current) => ({ ...current, promptIndex: index })),
        onFinish: finish,
      },
      { latencyMs: snapshot.profile.inputLatencyMs },
    )
    sessionRef.current = session
    session.start(exercise, bpm)
  }, [bpm, engine, exercise, finish, snapshot.profile.inputLatencyMs])

  const stop = useCallback(() => {
    sessionRef.current?.finishEarly()
    sessionRef.current = null
  }, [])

  useEffect(() => () => sessionRef.current?.stop(), [])
  useBeatClock({
    engine,
    sessionRef,
    beatRef,
    frameRef,
    beatsPerBar: exercise.timeSignature[0],
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

interface CompletionOptions {
  exercise: Exercise
  coach: Coach
  snapshot: ProgressSnapshot
  setTake: SetTake
  verdictsRef: React.MutableRefObject<Map<number, Verdict>>
  options: TakeOptions
}

/**
 * Everything that happens when a take ends: record it, store the telemetry, and
 * ask the coach. Kept apart from the session wiring because it is the part that
 * touches four other subsystems.
 */
function useTakeCompletion(
  completion: CompletionOptions,
): (result: SessionResult, estimate: SelfEstimate | null) => void {
  const { exercise, coach, snapshot, setTake, verdictsRef, options } = completion
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
      const feedback = await coach.analyze({
        telemetry,
        exercise,
        judgments: result.judgments,
        recentTakes: recentTakesRef.current,
      })
      recentTakesRef.current = [telemetry, ...recentTakesRef.current].slice(0, 5)
      setTake((current) => ({ ...current, feedback, coachPending: false }))
    },
    [coach, exercise, setTake, snapshot],
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
  beatsPerBar: number
  setTake: SetTake
}

/**
 * Advances the beat position every frame from the audio clock, and publishes
 * only the beat within the bar to React, which changes a few times a second
 * rather than sixty.
 */
function useBeatClock(options: BeatClockOptions): void {
  const { engine, sessionRef, beatRef, frameRef, beatsPerBar, setTake } = options
  useEffect(() => {
    const tick = (): void => {
      const metronome = sessionRef.current?.getMetronome()
      if (metronome) beatRef.current = metronome.timeToBodyBeat(engine.now())
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)

    const beatTimer = window.setInterval(() => {
      const inBar = ((Math.floor(beatRef.current) % beatsPerBar) + beatsPerBar) % beatsPerBar
      setTake((current) =>
        current.beatInBar === inBar ? current : { ...current, beatInBar: inBar },
      )
    }, 40)

    return () => {
      cancelAnimationFrame(frameRef.current)
      window.clearInterval(beatTimer)
    }
  }, [engine, sessionRef, beatRef, frameRef, beatsPerBar, setTake])
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

/** Best effort: a failed write must never interrupt practice. */
async function recordTake(telemetry: TakeTelemetry): Promise<void> {
  try {
    await fetch('/api/takes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(telemetry),
    })
  } catch {
    // The coach server is optional; progress is also kept in the browser.
  }
}

function daysSince(isoDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000))
}
