import type { OnsetEvent, PitchFrame } from './AudioEngine'
import type { BeatEvent } from './Metronome'

/**
 * What the practice engine needs from the audio layer, and nothing more.
 *
 * Depending on these rather than on `AudioEngine` and `Metronome` directly
 * keeps a take testable without a browser: the whole session state machine can
 * be driven by handing it synthetic frames and beats. It also means the audio
 * layer can be replaced without the engine noticing.
 */

/** A source of pitch readings and note attacks, on a shared clock. */
export interface AudioInput {
  /** Current time on the same clock that frames and onsets are stamped with. */
  now(): number
  onPitch(listener: (frame: PitchFrame) => void): () => void
  onOnset(listener: (event: OnsetEvent) => void): () => void
}

export interface TimeKeeperOptions {
  bpm: number
  beatsPerBar: number
  countInBeats: number
}

/**
 * A beat clock. Implementations schedule beats on an audio clock; the test
 * double steps them by hand.
 */
export interface TimeKeeper {
  /** Begin counting. Returns the time of the first count-in beat. */
  start(options: TimeKeeperOptions): number
  stop(): void
  /** Release any resources held. The session calls this when a take ends. */
  dispose(): void
  /** Convert a timestamp into a position in body beats, zero at the first note. */
  timeToBodyBeat(time: number): number
  bodyBeatToTime(beat: number): number
  readonly secondsPerBeat: number
  onBeat: ((event: BeatEvent) => void) | null
}

export type TimeKeeperFactory = () => TimeKeeper

export interface InputDeviceInfo {
  deviceId: string
  label: string
}

export type EngineState = 'idle' | 'starting' | 'running' | 'error'

/**
 * Everything the UI is allowed to ask of the audio layer.
 *
 * The UI depends on this rather than on `AudioEngine`, which keeps a component
 * from reaching past it for a context or a node (RC4), and lets the whole
 * practice flow be tested against a double.
 */
export interface AudioEngineApi extends AudioInput {
  getState(): EngineState
  /** Fired when the input goes away: unplugged, suspended, or processor dead. */
  onUnavailable(listener: (reason: string) => void): () => void
  /** Clear filter and envelope state so a take does not inherit the last one. */
  resetAnalysis(): void
  onStateChange(listener: (state: EngineState) => void): () => void
  listInputDevices(): Promise<InputDeviceInfo[]>
  requestPermission(): Promise<void>
  start(deviceId?: string): Promise<void>
  stop(): Promise<void>
  /** A beat clock bound to this engine's clock. */
  createTimeKeeper(volume?: number): TimeKeeper
  /** Set when the browser ignored a getUserMedia constraint. */
  readonly processingWarning: string | null
}
