import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
  error: string | null
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

  useEffect(() => engine.onStateChange(setState), [engine])

  // Stopping on unmount releases the input device; a browser that keeps it open
  // shows a recording indicator long after the app is gone.
  useEffect(() => {
    return () => {
      void engine.stop()
    }
  }, [engine])

  const value = useMemo<AudioContextValue>(() => {
    const refreshDevices = async (): Promise<void> => {
      try {
        setDevices(await engine.listInputDevices())
      } catch (cause) {
        setError(messageOf(cause))
      }
    }

    return {
      engine,
      coach,
      state,
      devices,
      error,
      refreshDevices,
      start: async (deviceId) => {
        setError(null)
        try {
          await engine.requestPermission()
          await engine.start(deviceId)
          await refreshDevices()
        } catch (cause) {
          setError(messageOf(cause))
        }
      },
      stop: async () => {
        await engine.stop()
      },
    }
  }, [engine, coach, state, devices, error])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useAudio(): AudioContextValue {
  const value = useContext(Context)
  if (!value) throw new Error('useAudio must be used inside an AudioProvider')
  return value
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
