import { centsFromNearestNote } from '../music/notes'

export interface PitchFrame {
  /** AudioContext time of the analysis window. */
  time: number
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

export interface InputDevice {
  deviceId: string
  label: string
}

export interface EngineOptions {
  /** Readings below this clarity are reported as "no pitch". */
  minClarity?: number
  /** Readings below this RMS are reported as "no pitch". */
  minRms?: number
}

type PitchListener = (frame: PitchFrame) => void
type OnsetListener = (event: OnsetEvent) => void
type StateListener = (state: EngineState) => void

export type EngineState = 'idle' | 'starting' | 'running' | 'error'

const WORKLET_URL = '/pitch-processor.js'

/**
 * Owns the microphone/interface stream, the AudioContext, and the pitch
 * worklet. Everything above this layer deals in PitchFrames and OnsetEvents and
 * never touches Web Audio directly, which keeps the practice engine testable.
 */
export class AudioEngine {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private worklet: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null

  private pitchListeners = new Set<PitchListener>()
  private onsetListeners = new Set<OnsetListener>()
  private stateListeners = new Set<StateListener>()

  private state: EngineState = 'idle'
  private options: Required<EngineOptions>
  public lastError: string | null = null

  constructor(options: EngineOptions = {}) {
    this.options = { minClarity: 0.82, minRms: 0.004, ...options }
  }

  getState(): EngineState {
    return this.state
  }

  /** AudioContext clock, so callers can timestamp against the same reference. */
  now(): number {
    return this.context ? this.context.currentTime : 0
  }

  getContext(): AudioContext | null {
    return this.context
  }

  /**
   * Reported round-trip latency, in seconds. Chrome fills these in for most
   * interfaces; where it does not, the manual tap calibration in
   * `audio/latency.ts` takes over.
   */
  reportedLatency(): number {
    if (!this.context) return 0
    const base = this.context.baseLatency ?? 0
    const output = (this.context as AudioContext & { outputLatency?: number }).outputLatency ?? 0
    return base + output
  }

  async listInputDevices(): Promise<InputDevice[]> {
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

      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.context = new AudioContext({ latencyHint: 'interactive' })
      await this.context.resume()
      await this.context.audioWorklet.addModule(WORKLET_URL)

      this.source = this.context.createMediaStreamSource(this.stream)
      this.worklet = new AudioWorkletNode(this.context, 'pitch-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        processorOptions: {},
      })
      this.worklet.port.onmessage = (event) => this.handleWorkletMessage(event.data)

      // No connection to destination: the Scarlett's own direct monitoring is
      // lower latency than anything routed through the browser, and skipping
      // it removes any chance of a feedback loop through speakers.
      this.source.connect(this.worklet)
      this.setState('running')
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      this.setState('error')
      await this.stop()
      throw error
    }
  }

  async stop(): Promise<void> {
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

  setOptions(options: EngineOptions): void {
    this.options = { ...this.options, ...options }
  }

  private handleWorkletMessage(message: { type: string } & Record<string, number>): void {
    if (message.type === 'onset') {
      const event: OnsetEvent = { time: message.time, level: message.level }
      this.onsetListeners.forEach((listener) => listener(event))
      return
    }
    if (message.type !== 'pitch') return

    const usable =
      message.frequency > 0 &&
      message.clarity >= this.options.minClarity &&
      message.rms >= this.options.minRms

    const nearest = usable ? centsFromNearestNote(message.frequency) : null
    const frame: PitchFrame = {
      time: message.time,
      frequency: usable ? message.frequency : 0,
      clarity: message.clarity,
      rms: message.rms,
      midi: nearest ? nearest.midi : null,
      cents: nearest ? nearest.cents : 0,
    }
    this.pitchListeners.forEach((listener) => listener(frame))
  }

  private setState(state: EngineState): void {
    this.state = state
    this.stateListeners.forEach((listener) => listener(state))
  }
}
