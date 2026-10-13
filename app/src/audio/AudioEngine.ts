import { centsFromNearestNote } from '../music/notes'
export type { EngineState, InputDeviceInfo, InputDeviceInfo as InputDevice } from './contracts'
import type { AudioEngineApi, EngineState, InputDeviceInfo, TimeKeeper } from './contracts'
import {
  DEFAULT_PITCH_PROCESSOR_OPTIONS,
  PITCH_PROCESSOR_NAME,
  type WorkletMessage,
} from './worklet/messages'
import { Metronome } from './Metronome'

export interface PitchFrame {
  /**
   * Centre of the audio this reading describes, on the AudioContext clock -
   * not the moment the analysis ran. A reading covers `windowSeconds` of audio
   * either side of it.
   */
  time: number
  /** Length of audio the reading covers, in seconds. */
  windowSeconds: number
  frequency: number
  /** 0..1 confidence from YIN. Below ~0.8 the reading is usually noise. */
  clarity: number
  rms: number
  /** Nearest equal-tempered pitch, or null when nothing is detected. */
  midi: number | null
  cents: number
}

export interface OnsetEvent {
  time: number
  level: number
}

export interface EngineOptions {
  /** Clarity needed to start reporting a pitch. */
  enterClarity?: number
  /**
   * Clarity needed to keep reporting it. Lower than `enterClarity` on purpose:
   * a plucked note's clarity falls as it decays, and a single threshold makes
   * the readout flicker on and off through the whole tail of every note.
   */
  exitClarity?: number
  /** Readings below this RMS are reported as "no pitch". */
  minRms?: number
}

type PitchListener = (frame: PitchFrame) => void
type OnsetListener = (event: OnsetEvent) => void
type StateListener = (state: EngineState) => void

const WORKLET_URL = '/pitch-processor.js'

/** Release a stream acquired for a start that was superseded before it finished. */
function discard(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop())
}

/**
 * Owns the microphone/interface stream, the AudioContext, and the pitch
 * worklet. Everything above this layer deals in PitchFrames and OnsetEvents and
 * never touches Web Audio directly, which keeps the practice engine testable.
 */
export class AudioEngine implements AudioEngineApi {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private worklet: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null

  private pitchListeners = new Set<PitchListener>()
  private onsetListeners = new Set<OnsetListener>()
  private stateListeners = new Set<StateListener>()

  private state: EngineState = 'idle'
  /** Incremented by every start and stop, so a superseded start can bail out. */
  private startGeneration = 0
  private unavailableListeners = new Set<(reason: string) => void>()
  private options: Required<EngineOptions>
  private holdingPitch = false
  public lastError: string | null = null

  /**
   * Set when the browser ignored a constraint. All three of echo cancellation,
   * noise suppression and automatic gain control are designed for speech:
   * noise suppression treats a sustained 41 Hz tone as stationary noise, and
   * AGC breaks every amplitude threshold the onset detector depends on.
   */
  public processingWarning: string | null = null

  constructor(options: EngineOptions = {}) {
    this.options = { enterClarity: 0.85, exitClarity: 0.65, minRms: 0.004, ...options }
  }

  getState(): EngineState {
    return this.state
  }

  /** AudioContext clock, so callers can timestamp against the same reference. */
  now(): number {
    return this.context ? this.context.currentTime : 0
  }

  /**
   * A beat clock bound to this engine's context. Created here because two
   * AudioContexts would mean two clocks, and the second one would make every
   * timing judgment wrong.
   */
  createTimeKeeper(volume?: number): TimeKeeper {
    if (!this.context) throw new Error('Audio engine is not running; call start() first')
    return new Metronome(this.context, volume)
  }

  async listInputDevices(): Promise<InputDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Input ${index + 1}`,
      }))
  }

  /**
   * Browsers hide device labels until some permission has been granted, so a
   * throwaway stream is opened and immediately closed before enumerating.
   */
  async requestPermission(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())
  }

  async start(deviceId?: string): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') return
    const generation = ++this.startGeneration
    this.setState('starting')
    this.lastError = null

    try {
      // Every one of these processing stages is designed for speech and will
      // happily gate, duck, or pitch-warp a bass guitar into uselessness.
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      if (this.superseded(generation)) return discard(stream)
      this.stream = stream

      this.context = new AudioContext({ latencyHint: 'interactive' })
      await this.context.resume()
      if (this.superseded(generation)) return void this.stop()

      await this.context.audioWorklet.addModule(WORKLET_URL)
      if (this.superseded(generation)) return void this.stop()

      this.source = this.context.createMediaStreamSource(this.stream)
      this.worklet = new AudioWorkletNode(this.context, PITCH_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        // The constraint asks for mono, but a browser that ignores it would
        // leave the worklet reading an empty first channel on a 2-in interface
        // with the bass in input 2. Explicit downmix removes the dependency.
        channelCount: 1,
        channelCountMode: 'explicit',
        processorOptions: { ...DEFAULT_PITCH_PROCESSOR_OPTIONS },
      })
      this.worklet.port.onmessage = (event: MessageEvent<WorkletMessage>) =>
        this.handleWorkletMessage(event.data)
      // Without this a processor that threw in its constructor is invisible:
      // the node exists, no message ever arrives, and the app reports running.
      this.worklet.onprocessorerror = () => {
        this.reportUnavailable('The audio processor stopped. Restart the input.')
      }
      this.watchForDisconnection()

      // No connection to destination: the Scarlett's own direct monitoring is
      // lower latency than anything routed through the browser, and skipping
      // it removes any chance of a feedback loop through speakers.
      this.source.connect(this.worklet)
      this.processingWarning = describeUnwantedProcessing(this.stream)
      this.setState('running')
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      this.setState('error')
      await this.stop()
      throw error
    }
  }

  async stop(): Promise<void> {
    this.startGeneration++
    this.holdingPitch = false
    this.worklet?.port.postMessage({ type: 'stop' })
    this.worklet?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    if (this.context && this.context.state !== 'closed') await this.context.close()
    this.worklet = null
    this.source = null
    this.stream = null
    this.context = null
    if (this.state !== 'error') this.setState('idle')
  }

  onPitch(listener: PitchListener): () => void {
    this.pitchListeners.add(listener)
    return () => this.pitchListeners.delete(listener)
  }

  onOnset(listener: OnsetListener): () => void {
    this.onsetListeners.add(listener)
    return () => this.onsetListeners.delete(listener)
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  /**
   * Fired when the input goes away under us - the interface unplugged, the
   * context suspended by the OS, the processor dead. Without it a take whose
   * clock has stopped waits for a beat that never comes.
   */
  onUnavailable(listener: (reason: string) => void): () => void {
    this.unavailableListeners.add(listener)
    return () => this.unavailableListeners.delete(listener)
  }

  /** Clear the worklet's filter and envelope state before a new take (AU3). */
  resetAnalysis(): void {
    this.worklet?.port.postMessage({ type: 'reset' })
  }

  private superseded(generation: number): boolean {
    return generation !== this.startGeneration
  }

  private watchForDisconnection(): void {
    const track = this.stream?.getAudioTracks()[0]
    track?.addEventListener('ended', () => {
      this.reportUnavailable('The audio input was disconnected.')
    })
    if (this.context) {
      this.context.onstatechange = () => {
        if (this.context?.state === 'closed') return
        if (this.context?.state === 'suspended') {
          this.reportUnavailable('The browser suspended audio. Click the page and start again.')
        }
      }
    }
  }

  private reportUnavailable(reason: string): void {
    if (this.state !== 'running') return
    this.lastError = reason
    this.setState('error')
    for (const listener of [...this.unavailableListeners]) listener(reason)
  }

  setOptions(options: EngineOptions): void {
    this.options = { ...this.options, ...options }
  }

  private handleWorkletMessage(message: WorkletMessage): void {
    if (message.type === 'onset') {
      const event: OnsetEvent = { time: message.time, level: message.level }
      this.onsetListeners.forEach((listener) => listener(event))
      return
    }
    if (message.type === 'overrun') {
      this.reportUnavailable(
        `This browser delivers audio ${message.renderQuantum} samples at a time, which is more than the processor buffers.`,
      )
      return
    }

    const usable = this.isUsable(message.frequency, message.clarity, message.rms)
    this.holdingPitch = usable
    const nearest = usable ? centsFromNearestNote(message.frequency) : null
    const frame: PitchFrame = {
      time: message.time,
      windowSeconds: message.windowSeconds,
      frequency: usable ? message.frequency : 0,
      clarity: message.clarity,
      rms: message.rms,
      midi: nearest ? nearest.midi : null,
      cents: nearest ? nearest.cents : 0,
    }
    this.pitchListeners.forEach((listener) => listener(frame))
  }

  /** Hysteresis: it is harder to acquire a pitch than it is to keep one. */
  private isUsable(frequency: number, clarity: number, rms: number): boolean {
    if (frequency <= 0 || rms < this.options.minRms) return false
    const needed = this.holdingPitch ? this.options.exitClarity : this.options.enterClarity
    return clarity >= needed
  }

  private setState(state: EngineState): void {
    this.state = state
    this.stateListeners.forEach((listener) => listener(state))
  }
}

/**
 * Constraints are requests, not commands: a browser that does not honour one
 * silently ignores it, so the only way to know is to read the settings back.
 */
export function describeUnwantedProcessing(stream: MediaStream): string | null {
  const track = stream.getAudioTracks()[0]
  if (!track) return null
  const settings = track.getSettings() as MediaTrackSettings & {
    echoCancellation?: boolean
    noiseSuppression?: boolean
    autoGainControl?: boolean
  }

  const stillOn = [
    settings.echoCancellation === true ? 'echo cancellation' : null,
    settings.noiseSuppression === true ? 'noise suppression' : null,
    settings.autoGainControl === true ? 'automatic gain control' : null,
  ].filter((name): name is string => name !== null)

  if (stillOn.length === 0) return null
  return `The browser kept ${stillOn.join(', ')} switched on for this input. All of these are built for speech and will interfere with pitch and timing detection. Try a different input, or a different browser.`
}
