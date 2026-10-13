import type { AudioEngine, OnsetEvent, PitchFrame } from '../audio/AudioEngine'
import { Metronome, type BeatEvent } from '../audio/Metronome'
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
 * modes differ enough to be worth separating: a play-along take is driven by
 * the metronome and graded on timing, while a call-and-response take has no
 * clock at all and simply waits for the right pitch.
 */

export type SessionPhase = 'idle' | 'count-in' | 'playing' | 'judging' | 'finished'

export interface SessionResult {
  exerciseId: string
  bpm: number
  judgments: NoteJudgment[]
  score: PerformanceScore
  durationSeconds: number
}

export interface SessionCallbacks {
  onPhase?: (phase: SessionPhase) => void
  onBeat?: (beat: BeatEvent) => void
  onPitch?: (frame: PitchFrame, tracker: PitchTracker) => void
  /** Fired as soon as a played note is resolved, for immediate feedback. */
  onNote?: (played: PlayedNote, targetIndex: number | null) => void
  /** Call-and-response only: the prompt the learner should play next. */
  onPrompt?: (note: TargetNote, index: number) => void
  onFinish?: (result: SessionResult) => void
}

export interface SessionOptions {
  /** Measured input latency, subtracted from every onset before judging. */
  latencyMs: number
  /** Beats of silence allowed after the last note before the take ends. */
  tailBeats?: number
}

const DEFAULT_TAIL_BEATS = 2

export class PracticeSession {
  private metronome: Metronome | null = null
  private readonly tracker = new PitchTracker()
  private unsubscribers: Array<() => void> = []
  private pendingOnsets: OnsetEvent[] = []
  private played: PlayedNote[] = []
  private targets: TargetNote[] = []
  private phase: SessionPhase = 'idle'
  private startedAt = 0
  private promptIndex = 0
  private matchFrames = 0
  private exercise: Exercise | null = null
  private bpm = 60
  private finishTimer: number | null = null

  /** Consecutive agreeing frames before a call-and-response prompt is passed. */
  private static readonly FRAMES_TO_ACCEPT = 3

  constructor(
    private readonly engine: AudioEngine,
    private readonly callbacks: SessionCallbacks = {},
    private readonly options: SessionOptions = { latencyMs: 0 },
  ) {}

  get currentPhase(): SessionPhase {
    return this.phase
  }

  get currentPromptIndex(): number {
    return this.promptIndex
  }

  getMetronome(): Metronome | null {
    return this.metronome
  }

  start(exercise: Exercise, bpm: number): void {
    this.stop()
    this.exercise = exercise
    this.bpm = bpm
    this.targets = expandRepeats(exercise)
    this.played = []
    this.pendingOnsets = []
    this.promptIndex = 0
    this.matchFrames = 0
    this.tracker.reset()
    this.startedAt = this.engine.now()

    this.subscribe()
    if (exercise.mode === 'call-response') {
      this.setPhase('playing')
      this.callbacks.onPrompt?.(this.targets[0], 0)
      return
    }
    this.startMetronome(exercise, bpm)
  }

  stop(): void {
    this.metronome?.stop()
    this.metronome = null
    if (this.finishTimer !== null) window.clearTimeout(this.finishTimer)
    this.finishTimer = null
    this.unsubscribers.forEach((off) => off())
    this.unsubscribers = []
    if (this.phase !== 'finished') this.setPhase('idle')
  }

  /** Abandon the take and report what was played up to this point. */
  finishEarly(): void {
    if (this.phase === 'idle' || this.phase === 'finished') return
    this.finish()
  }

  private subscribe(): void {
    this.unsubscribers.push(
      this.engine.onPitch((frame) => this.handlePitch(frame)),
      this.engine.onOnset((onset) => this.handleOnset(onset)),
    )
  }

  private startMetronome(exercise: Exercise, bpm: number): void {
    const context = this.engine.getContext()
    if (!context) throw new Error('Audio engine is not running')

    const beatsPerBar = exercise.timeSignature[0]
    this.metronome = new Metronome(context)
    this.metronome.onBeat = (beat) => this.handleBeat(beat)
    this.metronome.start({
      bpm,
      beatsPerBar,
      countInBeats: exercise.countInBars * beatsPerBar,
    })
    this.setPhase('count-in')
  }

  private handleBeat(beat: BeatEvent): void {
    this.callbacks.onBeat?.(beat)
    if (beat.bodyBeat === 0) this.setPhase('playing')
    if (this.phase === 'playing' && beat.bodyBeat >= this.endBeat()) this.scheduleFinish()
  }

  private endBeat(): number {
    const last = this.targets[this.targets.length - 1]
    if (!last) return 0
    return last.startBeat + last.durationBeats + (this.options.tailBeats ?? DEFAULT_TAIL_BEATS)
  }

  private handlePitch(frame: PitchFrame): void {
    this.tracker.push(frame)
    this.callbacks.onPitch?.(frame, this.tracker)
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
    const ready = this.pendingOnsets.filter((onset) => this.tracker.isResolvable(onset.time, now))
    if (ready.length === 0) return
    this.pendingOnsets = this.pendingOnsets.filter((onset) => !ready.includes(onset))

    for (const onset of ready) {
      const resolution = this.tracker.resolve(onset.time)
      const played: PlayedNote = {
        beat: this.beatOf(onset.time),
        midi: resolution.midi,
        cents: resolution.cents,
        level: onset.level,
      }
      this.played.push(played)
      this.callbacks.onNote?.(played, null)
    }
  }

  /** Convert an onset timestamp into a position in body beats, latency-corrected. */
  private beatOf(onsetTime: number): number {
    if (!this.metronome) return 0
    return this.metronome.timeToBodyBeat(onsetTime - this.options.latencyMs / 1000)
  }

  /**
   * Call and response has no clock: a prompt is passed once the detector has
   * agreed on the right pitch for several frames running, which rules out the
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
    if (this.matchFrames < PracticeSession.FRAMES_TO_ACCEPT) return

    this.matchFrames = 0
    this.played.push({
      beat: this.promptIndex,
      midi: frame.midi,
      cents: frame.cents,
      level: frame.rms,
    })
    this.callbacks.onNote?.(this.played[this.played.length - 1], this.promptIndex)
    this.promptIndex++

    const next = this.targets[this.promptIndex]
    if (next) this.callbacks.onPrompt?.(next, this.promptIndex)
    else this.finish()
  }

  /** Give the last notes time to resolve before judging the take. */
  private scheduleFinish(): void {
    if (this.finishTimer !== null) return
    this.setPhase('judging')
    this.finishTimer = window.setTimeout(() => this.finish(), 400)
  }

  private finish(): void {
    const exercise = this.exercise
    if (!exercise) return
    this.resolvePendingOnsets(Number.POSITIVE_INFINITY)

    const judgments = judgePerformance(this.targets, this.played, this.bpm)
    const result: SessionResult = {
      exerciseId: exercise.id,
      bpm: this.bpm,
      judgments,
      score: scorePerformance(judgments),
      durationSeconds: Math.max(0, this.engine.now() - this.startedAt),
    }

    this.stop()
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
  if (repeats <= 1) return exercise.notes

  const last = exercise.notes[exercise.notes.length - 1]
  const beatsPerBar = exercise.timeSignature[0]
  const span = Math.ceil((last.startBeat + last.durationBeats) / beatsPerBar) * beatsPerBar

  return Array.from({ length: repeats }, (_, pass) =>
    exercise.notes.map((note) => ({ ...note, startBeat: note.startBeat + pass * span })),
  ).flat()
}
