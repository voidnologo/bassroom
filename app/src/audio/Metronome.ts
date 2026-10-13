import type { TimeKeeper, TimeKeeperOptions } from './contracts'

/**
 * Click track built on the lookahead-scheduler pattern: a timer wakes up every
 * 25 ms and schedules any beat falling in the next 120 ms directly on the audio
 * clock. setInterval alone is far too jittery to play along with; the audio
 * clock is sample-accurate.
 */

export interface BeatEvent {
  /** 0-based beat index counted from the very start, including the count-in. */
  index: number
  /** AudioContext time the click sounds. */
  time: number
  /** True on the downbeat of a bar. */
  accented: boolean
  /** Negative during the count-in, 0 at the first beat of the exercise body. */
  bodyBeat: number
}

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.12

export class Metronome implements TimeKeeper {
  private context: AudioContext
  private output: GainNode
  private timer: number | null = null

  private nextBeatIndex = 0
  private nextBeatTime = 0
  private startTime = 0

  private beatsPerBar = 4
  private bpm = 60
  private countInBeats = 0

  public onBeat: ((event: BeatEvent) => void) | null = null
  public muted = false

  constructor(context: AudioContext, volume = 0.35) {
    this.context = context
    this.output = context.createGain()
    this.output.gain.value = volume
    this.output.connect(context.destination)
  }

  get secondsPerBeat(): number {
    return 60 / this.bpm
  }

  get isRunning(): boolean {
    return this.timer !== null
  }

  /** AudioContext time at which body beat 0 occurs. */
  get bodyStartTime(): number {
    return this.startTime + this.countInBeats * this.secondsPerBeat
  }

  setVolume(volume: number): void {
    this.output.gain.value = volume
  }

  /**
   * Changing tempo mid-run keeps the already-scheduled beat in place and
   * re-spaces everything after it, so a tempo nudge never produces a double
   * click or a dropped beat.
   */
  setTempo(bpm: number): void {
    this.bpm = Math.max(20, Math.min(300, bpm))
  }

  getTempo(): number {
    return this.bpm
  }

  start(options: TimeKeeperOptions & { startDelay?: number }): number {
    this.stop()
    this.setTempo(options.bpm)
    this.beatsPerBar = options.beatsPerBar
    this.countInBeats = options.countInBeats
    this.nextBeatIndex = 0
    this.startTime = this.context.currentTime + (options.startDelay ?? 0.25)
    this.nextBeatTime = this.startTime
    this.timer = window.setInterval(() => this.schedule(), LOOKAHEAD_MS)
    this.schedule()
    return this.startTime
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }

  /**
   * Disconnect the output. A take creates a metronome and abandons it; without
   * this, every take leaves a GainNode wired to the destination for the life of
   * the AudioContext.
   */
  dispose(): void {
    this.stop()
    this.onBeat = null
    this.output.disconnect()
  }

  /** Convert an AudioContext timestamp into a position in body beats. */
  timeToBodyBeat(time: number): number {
    return (time - this.bodyStartTime) / this.secondsPerBeat
  }

  bodyBeatToTime(beat: number): number {
    return this.bodyStartTime + beat * this.secondsPerBeat
  }

  private schedule(): void {
    const now = this.context.currentTime
    const horizon = now + SCHEDULE_AHEAD_S
    while (this.nextBeatTime < horizon) {
      const accented = this.nextBeatIndex % this.beatsPerBar === 0
      const bodyBeat = this.nextBeatIndex - this.countInBeats
      // A throttled timer - a background tab, a muted click track - leaves
      // beats in the past. Scheduling an oscillator at a past time plays it
      // immediately, so catching up would fire a burst of every missed beat at
      // once. The beat is still reported so the take can end.
      const overdue = this.nextBeatTime < now
      if (!this.muted && !overdue) this.click(this.nextBeatTime, accented, bodyBeat < 0)
      this.onBeat?.({ index: this.nextBeatIndex, time: this.nextBeatTime, accented, bodyBeat })
      this.nextBeatIndex++
      this.nextBeatTime += this.secondsPerBeat
    }
  }

  /** Short sine blip rather than a sample, so there is nothing to load. */
  private click(time: number, accented: boolean, countIn: boolean): void {
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    oscillator.frequency.value = accented ? 1600 : 1100
    // The count-in sounds duller so it is audible that the exercise has not
    // begun yet without having to watch the screen.
    envelope.gain.setValueAtTime(0, time)
    envelope.gain.linearRampToValueAtTime(countIn ? 0.5 : 1, time + 0.001)
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)
    oscillator.connect(envelope)
    envelope.connect(this.output)
    oscillator.start(time)
    oscillator.stop(time + 0.06)
  }
}
