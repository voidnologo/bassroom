import type { BeatEvent, OnsetEvent, PitchFrame } from '../audio/contracts'

import type { AudioInput, TimeKeeper, TimeKeeperFactory } from '../audio/contracts'
import { countInBeatsOf } from '../music/meter'
import type { Exercise, TargetNote } from '../music/types'
import {
  judgePerformance,
  scorePerformance,
  type NoteJudgment,
  type PerformanceScore,
  type PlayedNote,
} from './judge'
import { PitchTracker } from './PitchTracker'

/**
 * Runs one take.
 *
 * Owns the clock, collects what was played, and judges it at the end. The two
 * modes differ enough to be worth keeping apart inside it: a play-along take is
 * driven by the beat clock and graded on timing, while a call-and-response take
 * has no clock at all and simply waits for the right pitch.
 *
 * It depends on `AudioInput` and `TimeKeeper` rather than on the concrete audio
 * classes, so the whole state machine can be driven by synthetic frames in a
 * test without a browser.
 */

export type SessionPhase = 'idle' | 'count-in' | 'playing' | 'judging' | 'finished'

export interface SessionResult {
  exerciseId: string
  bpm: number
  judgments: NoteJudgment[]
  score: PerformanceScore
  durationSeconds: number
  /** True when the take was stopped by the player rather than running out. */
  abandoned: boolean
}

export interface SessionCallbacks {
  onPhase?: (phase: SessionPhase) => void
  onBeat?: (beat: BeatEvent) => void
  onPitch?: (frame: PitchFrame) => void
  /** Fired as soon as a played note is resolved, for immediate feedback. */
  onNote?: (played: PlayedNote, targetIndex: number | null) => void
  /** Call-and-response only: the prompt the learner should play next. */
  onPrompt?: (note: TargetNote, index: number) => void
  onFinish?: (result: SessionResult) => void
}

export interface PracticeSessionOptions {
  input: AudioInput
  createTimeKeeper: TimeKeeperFactory
  callbacks?: SessionCallbacks
  /** Measured input latency, subtracted from every onset before judging. */
  latencyMs?: number
  /** Beats of silence allowed after the last note before the take ends. */
  tailBeats?: number
  /** Seconds to wait after the last beat for pending onsets to resolve. */
  settleSeconds?: number
}

const DEFAULT_TAIL_BEATS = 2
const DEFAULT_SETTLE_SECONDS = 0.4

/** Consecutive agreeing frames before a call-and-response prompt is passed. */
const FRAMES_TO_ACCEPT = 3

export class PracticeSession {
  private readonly input: AudioInput
  private readonly createTimeKeeper: TimeKeeperFactory
  private readonly callbacks: SessionCallbacks
  private readonly latencyMs: number
  private readonly tailBeats: number
  private readonly settleSeconds: number

  private readonly tracker = new PitchTracker()
  private timeKeeper: TimeKeeper | null = null
  private unsubscribers: Array<() => void> = []
  private finishTimer: ReturnType<typeof setTimeout> | null = null

  private pendingOnsets: OnsetEvent[] = []
  private played: PlayedNote[] = []
  private targets: TargetNote[] = []
  private exercise: Exercise | null = null
  private bpm = 60
  private phase: SessionPhase = 'idle'
  private startedAt = 0
  private promptIndex = 0
  private matchFrames = 0
  private abandoned = false

  constructor(options: PracticeSessionOptions) {
    this.input = options.input
    this.createTimeKeeper = options.createTimeKeeper
    this.callbacks = options.callbacks ?? {}
    this.latencyMs = options.latencyMs ?? 0
    this.tailBeats = options.tailBeats ?? DEFAULT_TAIL_BEATS
    this.settleSeconds = options.settleSeconds ?? DEFAULT_SETTLE_SECONDS
  }

  get currentPhase(): SessionPhase {
    return this.phase
  }

  get currentPromptIndex(): number {
    return this.promptIndex
  }

  /** Null until a take with a clock is running. */
  getTimeKeeper(): TimeKeeper | null {
    return this.timeKeeper
  }

  start(exercise: Exercise, bpm: number): void {
    this.teardown()
    this.exercise = exercise
    this.bpm = bpm
    this.targets = expandRepeats(exercise)
    this.played = []
    this.pendingOnsets = []
    this.promptIndex = 0
    this.matchFrames = 0
    this.abandoned = false
    this.tracker.reset()
    this.startedAt = this.input.now()

    this.unsubscribers.push(
      this.input.onPitch((frame) => this.handlePitch(frame)),
      this.input.onOnset((onset) => this.handleOnset(onset)),
    )

    if (exercise.mode === 'call-response') {
      this.setPhase('playing')
      const first = this.targets[0]
      if (first) this.callbacks.onPrompt?.(first, 0)
      else this.finish()
      return
    }
    this.startClock(exercise, bpm)
  }

  /**
   * Abandon the take. Reports what was played so far, which is more useful than
   * discarding it, and is marked as abandoned so nothing treats it as a
   * complete performance.
   */
  stop(): void {
    if (this.phase === 'idle' || this.phase === 'finished') {
      this.teardown()
      return
    }
    this.abandoned = true
    this.finish()
  }

  /** Release everything without reporting a result. */
  dispose(): void {
    this.teardown()
    this.setPhase('idle')
  }

  private teardown(): void {
    if (this.finishTimer !== null) clearTimeout(this.finishTimer)
    this.finishTimer = null
    this.timeKeeper?.dispose()
    this.timeKeeper = null
    for (const off of this.unsubscribers) off()
    this.unsubscribers = []
  }

  private startClock(exercise: Exercise, bpm: number): void {
    const keeper = this.createTimeKeeper()
    keeper.onBeat = (beat) => this.handleBeat(beat)
    this.timeKeeper = keeper
    this.setPhase('count-in')
    keeper.start({
      bpm,
      beatsPerBar: exercise.timeSignature[0],
      countInBeats: countInBeatsOf(exercise),
    })
  }

  private handleBeat(beat: BeatEvent): void {
    this.callbacks.onBeat?.(beat)
    if (this.phase === 'count-in' && beat.bodyBeat >= 0) this.setPhase('playing')
    if (this.phase === 'playing' && beat.bodyBeat >= this.endBeat()) this.scheduleFinish()
  }

  /** Last note's end, plus a tail so a late final note still counts. */
  private endBeat(): number {
    const last = this.targets[this.targets.length - 1]
    if (!last) return 0
    return last.startBeat + last.durationBeats + this.tailBeats
  }

  private handlePitch(frame: PitchFrame): void {
    this.tracker.push(frame)
    this.callbacks.onPitch?.(frame)
    this.resolvePendingOnsets(frame.time)
    if (this.exercise?.mode === 'call-response') this.checkPrompt(frame)
  }

  private handleOnset(onset: OnsetEvent): void {
    if (this.phase !== 'playing') return
    if (this.exercise?.mode === 'call-response') return
    this.pendingOnsets.push(onset)
  }

  /** An onset is graded once enough frames have arrived to name its pitch. */
  private resolvePendingOnsets(now: number): void {
    if (this.pendingOnsets.length === 0) return

    const ready: OnsetEvent[] = []
    const waiting: OnsetEvent[] = []
    for (const onset of this.pendingOnsets) {
      if (this.tracker.isResolvable(onset.time, now)) ready.push(onset)
      else waiting.push(onset)
    }
    this.pendingOnsets = waiting

    for (const onset of ready) {
      const resolution = this.tracker.resolve(onset.time)
      const played: PlayedNote = {
        beat: this.beatOf(onset.time),
        midi: resolution.midi,
        cents: resolution.cents,
        level: onset.level,
        detection: {
          riseRatio: onset.riseRatio,
          agreement: resolution.agreement,
          frameCount: resolution.frameCount,
          clarity: resolution.clarity,
        },
      }
      this.played.push(played)
      this.callbacks.onNote?.(played, null)
    }
  }

  /** An onset timestamp as a position in body beats, latency-corrected. */
  private beatOf(onsetTime: number): number {
    if (!this.timeKeeper) return 0
    return this.timeKeeper.timeToBodyBeat(onsetTime - this.latencyMs / 1000)
  }

  /**
   * Call and response has no clock: a prompt is passed once the detector has
   * agreed on the right pitch for several frames running, which stops the
   * transient of a neighbouring string being counted as the answer.
   */
  private checkPrompt(frame: PitchFrame): void {
    const target = this.targets[this.promptIndex]
    if (!target || this.phase !== 'playing') return

    if (frame.midi !== target.midi) {
      this.matchFrames = 0
      return
    }

    this.matchFrames++
    if (this.matchFrames < FRAMES_TO_ACCEPT) return
    this.matchFrames = 0

    const played: PlayedNote = {
      beat: this.promptIndex,
      midi: frame.midi,
      cents: frame.cents,
      level: frame.rms,
    }
    this.played.push(played)
    this.callbacks.onNote?.(played, this.promptIndex)
    this.promptIndex++

    const next = this.targets[this.promptIndex]
    if (next) this.callbacks.onPrompt?.(next, this.promptIndex)
    else this.finish()
  }

  /** Give the last notes time to resolve before judging the take. */
  private scheduleFinish(): void {
    if (this.finishTimer !== null) return
    this.setPhase('judging')
    this.finishTimer = setTimeout(() => {
      this.finishTimer = null
      this.finish()
    }, this.settleSeconds * 1000)
  }

  private finish(): void {
    const exercise = this.exercise
    if (!exercise || this.phase === 'finished') return

    // Anything still pending is graded on what was heard, rather than dropped.
    // Infinity rather than a clock reading: the engine may already have stopped,
    // and AudioEngine.now() returns 0 once its context is gone.
    this.resolvePendingOnsets(Number.POSITIVE_INFINITY)

    const judgments = judgePerformance(this.targets, this.played, this.bpm)
    const result: SessionResult = {
      exerciseId: exercise.id,
      bpm: this.bpm,
      judgments,
      score: scorePerformance(judgments),
      durationSeconds: Math.max(0, this.input.now() - this.startedAt),
      abandoned: this.abandoned,
    }

    this.teardown()
    this.setPhase('finished')
    this.callbacks.onFinish?.(result)
  }

  private setPhase(phase: SessionPhase): void {
    if (this.phase === phase) return
    this.phase = phase
    this.callbacks.onPhase?.(phase)
  }
}

/** Expand an exercise's repeats into one flat, absolute-beat note list. */
export function expandRepeats(exercise: Exercise): TargetNote[] {
  const repeats = exercise.repeats ?? 1
  if (repeats <= 1 || exercise.notes.length === 0) return exercise.notes

  const last = exercise.notes[exercise.notes.length - 1]
  const beatsPerBar = exercise.timeSignature[0]
  const span = Math.ceil((last.startBeat + last.durationBeats) / beatsPerBar) * beatsPerBar

  return Array.from({ length: repeats }, (_, pass) =>
    exercise.notes.map((note) => ({ ...note, startBeat: note.startBeat + pass * span })),
  ).flat()
}
