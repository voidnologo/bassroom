import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine, type EngineState, type InputDevice } from '../audio/AudioEngine'
import { CoachService } from '../coach'

/**
 * One AudioEngine and one CoachService for the whole app.
 *
 * Two AudioContexts would mean two clocks, and the second one would make every
 * timing judgment wrong, so the engine is created once here and handed down.
 */

interface AudioContextValue {
  engine: AudioEngine
  coach: CoachService
  state: EngineState
  devices: InputDevice[]
  error: string | null
  start: (deviceId?: string) => Promise<void>
  stop: () => Promise<void>
  refreshDevices: () => Promise<void>
}

const Context = createContext<AudioContextValue | null>(null)

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<AudioEngine | null>(null)
  const coachRef = useRef<CoachService | null>(null)
  engineRef.current ??= new AudioEngine()
  coachRef.current ??= new CoachService()

  const engine = engineRef.current
  const coach = coachRef.current

  const [state, setState] = useState<EngineState>(engine.getState())
  const [devices, setDevices] = useState<InputDevice[]>([])
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
