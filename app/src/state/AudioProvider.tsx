import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine } from '../audio/AudioEngine'
import type { AudioEngineApi, EngineState, InputDeviceInfo } from '../audio/contracts'
import { CoachService } from '../coach'

/**
 * One AudioEngine and one CoachService for the whole app.
 *
 * Two AudioContexts would mean two clocks, and the second one would make every
 * timing judgment wrong, so the engine is created once here and handed down.
 */

interface AudioContextValue {
  engine: AudioEngineApi
  coach: CoachService
  state: EngineState
  devices: InputDeviceInfo[]
  /** Human-readable input failure, or null. */
  error: string | null
  /** Set when the browser ignored a getUserMedia constraint. */
  processingWarning: string | null
  /** Set when a model-backed coach call failed and the rules answered instead. */
  coachError: string | null
  start: (deviceId?: string) => Promise<void>
  stop: () => Promise<void>
  refreshDevices: () => Promise<void>
}

const Context = createContext<AudioContextValue | null>(null)

export interface AudioProviderProps {
  children: React.ReactNode
  /** Supplied by tests; production builds its own. */
  engine?: AudioEngineApi
  coach?: CoachService
}

export function AudioProvider({
  children,
  engine: injected,
  coach: injectedCoach,
}: AudioProviderProps) {
  const engineRef = useRef<AudioEngineApi | null>(null)
  const coachRef = useRef<CoachService | null>(null)
  engineRef.current ??= injected ?? new AudioEngine()
  coachRef.current ??= injectedCoach ?? new CoachService()

  const engine = engineRef.current
  const coach = coachRef.current

  const [state, setState] = useState<EngineState>(engine.getState())
  const [devices, setDevices] = useState<InputDeviceInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [processingWarning, setProcessingWarning] = useState<string | null>(null)
  const [coachError, setCoachError] = useState<string | null>(coach.lastModelError)

  useEffect(() => engine.onStateChange(setState), [engine])
  useEffect(() => coach.onChange((status) => setCoachError(status.lastModelError)), [coach])

  // Stopping on unmount releases the input device; a browser that keeps it open
  // shows a recording indicator long after the app is gone.
  useEffect(() => {
    return () => {
      void engine.stop()
    }
  }, [engine])

  /**
   * Identity depends only on the engine. It used to be rebuilt whenever the
   * device list changed, which the setup screen's effect depended on - so
   * refreshing devices requested them again, forever.
   */
  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      const found = await engine.listInputDevices()
      setDevices((current) => (sameDevices(current, found) ? current : found))
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [engine])

  const start = useCallback(
    async (deviceId?: string): Promise<void> => {
      setError(null)
      try {
        await engine.requestPermission()
        await engine.start(deviceId)
        setProcessingWarning(engine.processingWarning)
        await refreshDevices()
      } catch (cause) {
        setError(messageOf(cause))
      }
    },
    [engine, refreshDevices],
  )

  const stop = useCallback(async (): Promise<void> => {
    await engine.stop()
  }, [engine])

  const value = useMemo<AudioContextValue>(
    () => ({
      engine,
      coach,
      state,
      devices,
      error,
      processingWarning,
      coachError,
      start,
      stop,
      refreshDevices,
    }),
    [
      engine,
      coach,
      state,
      devices,
      error,
      processingWarning,
      coachError,
      start,
      stop,
      refreshDevices,
    ],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useAudio(): AudioContextValue {
  const value = useContext(Context)
  if (!value) throw new Error('useAudio must be used inside an AudioProvider')
  return value
}

/** Devices are re-fetched as fresh objects, so compare by what identifies them. */
function sameDevices(a: InputDeviceInfo[], b: InputDeviceInfo[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (device, index) => device.deviceId === b[index].deviceId && device.label === b[index].label,
  )
}

function messageOf(cause: unknown): string {
  if (cause instanceof Error && cause.name === 'NotAllowedError') {
    return 'The browser blocked microphone access. Allow it for this page and try again.'
  }
  if (cause instanceof Error && cause.name === 'NotFoundError') {
    return 'No audio input was found. Check that the interface is connected.'
  }
  return cause instanceof Error ? cause.message : String(cause)
}
