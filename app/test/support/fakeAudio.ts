import type { OnsetEvent, PitchFrame } from '../../src/audio/AudioEngine'
import type { AudioInput, TimeKeeper, TimeKeeperOptions } from '../../src/audio/contracts'
import type { BeatEvent } from '../../src/audio/Metronome'

/**
 * Test doubles for the audio layer.
 *
 * A take is a state machine driven by frames, onsets and beats arriving on one
 * clock. These let a test supply all three by hand, so the whole of
 * PracticeSession can be exercised deterministically without a browser.
 */

/** Matches the real worklet's window, so attribution behaves as it will live. */
const ANALYSIS_WINDOW_SECONDS = 0.128

export class FakeAudioInput implements AudioInput {
  private pitchListeners = new Set<(frame: PitchFrame) => void>()
  private onsetListeners = new Set<(event: OnsetEvent) => void>()

  /** Live listener counts, so a test can assert nothing was left subscribed. */
  get pitchListenerCount(): number {
    return this.pitchListeners.size
  }

  get onsetListenerCount(): number {
    return this.onsetListeners.size
  }

  public currentTime = 0

  now(): number {
    return this.currentTime
  }

  onPitch(listener: (frame: PitchFrame) => void): () => void {
    this.pitchListeners.add(listener)
    return () => this.pitchListeners.delete(listener)
  }

  onOnset(listener: (event: OnsetEvent) => void): () => void {
    this.onsetListeners.add(listener)
    return () => this.onsetListeners.delete(listener)
  }

  /** Deliver one pitch reading, advancing the clock to it. */
  emitPitch(frame: Partial<PitchFrame> & { time: number }): void {
    this.currentTime = Math.max(this.currentTime, frame.time)
    const complete: PitchFrame = {
      frequency: 0,
      windowSeconds: ANALYSIS_WINDOW_SECONDS,
      clarity: 0.95,
      rms: 0.2,
      midi: null,
      cents: 0,
      ...frame,
    }
    for (const listener of [...this.pitchListeners]) listener(complete)
  }

  emitOnset(time: number, level = 0.5): void {
    this.currentTime = Math.max(this.currentTime, time)
    for (const listener of [...this.onsetListeners]) listener({ time, level })
  }

  /**
   * A played note: an attack, then enough agreeing frames afterwards for the
   * tracker to name its pitch. This is what the real pipeline produces.
   */
  playNote(options: { time: number; midi: number | null; cents?: number; level?: number }): void {
    const { time, midi, cents = 0, level = 0.5 } = options
    this.emitOnset(time, level)
    // Readings only count once their whole window is past the attack, so the
    // first one here is half a window late, as the real pipeline produces.
    const first = ANALYSIS_WINDOW_SECONDS / 2
    for (let offset = first; offset <= first + 0.15; offset += 0.021) {
      this.emitPitch({ time: time + offset, midi, cents, frequency: midi === null ? 0 : 100 })
    }
  }

  /** Advance the clock and deliver a silent frame, so pending work resolves. */
  idleUntil(time: number): void {
    this.emitPitch({ time, midi: null, clarity: 0, rms: 0 })
  }
}

export class FakeTimeKeeper implements TimeKeeper {
  public onBeat: ((event: BeatEvent) => void) | null = null
  public disposed = false
  public stopped = false

  private bpm = 60
  private beatsPerBar = 4
  private countInBeats = 0
  private startTime = 0
  private nextIndex = 0

  constructor(private readonly clock: { currentTime: number }) {}

  get secondsPerBeat(): number {
    return 60 / this.bpm
  }

  start(options: TimeKeeperOptions): number {
    this.bpm = options.bpm
    this.beatsPerBar = options.beatsPerBar
    this.countInBeats = options.countInBeats
    this.startTime = this.clock.currentTime
    this.nextIndex = 0
    this.stopped = false
    return this.startTime
  }

  stop(): void {
    this.stopped = true
  }

  dispose(): void {
    this.stopped = true
    this.disposed = true
    this.onBeat = null
  }

  timeToBodyBeat(time: number): number {
    return (time - this.bodyStartTime) / this.secondsPerBeat
  }

  bodyBeatToTime(beat: number): number {
    return this.bodyStartTime + beat * this.secondsPerBeat
  }

  private get bodyStartTime(): number {
    return this.startTime + this.countInBeats * this.secondsPerBeat
  }

  /** Fire the next beat, advancing the shared clock to it. */
  tick(): BeatEvent {
    const index = this.nextIndex++
    const event: BeatEvent = {
      index,
      time: this.startTime + index * this.secondsPerBeat,
      accented: index % this.beatsPerBar === 0,
      bodyBeat: index - this.countInBeats,
    }
    this.clock.currentTime = Math.max(this.clock.currentTime, event.time)
    this.onBeat?.(event)
    return event
  }

  /** Fire beats until the body beat reaches `beat`. */
  tickTo(beat: number): void {
    let guard = 0
    while (this.nextIndex - this.countInBeats <= beat) {
      this.tick()
      if (++guard > 2000) throw new Error(`tickTo(${beat}) ran away`)
    }
  }
}
