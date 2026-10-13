import type {
  AudioEngineApi,
  EngineState,
  InputDeviceInfo,
  TimeKeeper,
} from '../../src/audio/contracts'
import { FakeAudioInput, FakeTimeKeeper } from './fakeAudio'

/**
 * An audio engine that never touches Web Audio.
 *
 * Lets the whole app be rendered and a take driven to completion in jsdom,
 * which is where a first-run crash in the practice flow would otherwise only
 * show up on a real machine with a bass plugged in.
 */
export class FakeAudioEngine extends FakeAudioInput implements AudioEngineApi {
  public processingWarning: string | null = null
  public readonly clocks: FakeTimeKeeper[] = []
  public devices: InputDeviceInfo[] = [{ deviceId: 'fake-1', label: 'Fake Interface' }]
  public startedWith: string | undefined
  public stopCount = 0

  private state: EngineState
  private stateListeners = new Set<(state: EngineState) => void>()

  constructor(initialState: EngineState = 'running') {
    super()
    this.state = initialState
  }

  /** The clock the most recent take is running on. */
  get clock(): FakeTimeKeeper {
    const latest = this.clocks[this.clocks.length - 1]
    if (!latest) throw new Error('No time keeper has been created yet')
    return latest
  }

  getState(): EngineState {
    return this.state
  }

  setState(state: EngineState): void {
    this.state = state
    for (const listener of [...this.stateListeners]) listener(state)
  }

  onStateChange(listener: (state: EngineState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  async listInputDevices(): Promise<InputDeviceInfo[]> {
    return this.devices
  }

  async requestPermission(): Promise<void> {}

  async start(deviceId?: string): Promise<void> {
    this.startedWith = deviceId
    this.setState('running')
  }

  async stop(): Promise<void> {
    this.stopCount++
    this.setState('idle')
  }

  createTimeKeeper(): TimeKeeper {
    const keeper = new FakeTimeKeeper(this)
    this.clocks.push(keeper)
    return keeper
  }
}
