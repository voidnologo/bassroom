import { useCallback, useEffect, useRef } from 'react'
import { DiagnosticsRecorder, type RecordMetadata } from '../../audio/diagnostics'
import type { AudioInput } from '../../audio/contracts'
import { postDiagnostics } from '../../audio/diagnosticsClient'

export interface DiagnosticsHandle {
  /** Start a fresh recording. */
  begin: () => void
  /** Post what has been buffered and clear it. No request is made when off. */
  flush: (meta: RecordMetadata) => void
}

/**
 * Buffers the raw frames and onsets behind a take so the detector's constants
 * can be checked against a real instrument.
 *
 * Subscribing at all is conditional: with diagnostics off there is no listener
 * on the ~47 Hz pitch stream, so the recording path costs nothing to leave in.
 */
export function useDiagnosticsRecorder(
  input: AudioInput | null,
  enabled: boolean,
): DiagnosticsHandle {
  const recorderRef = useRef(new DiagnosticsRecorder())
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if (!input || !enabled) return
    const recorder = recorderRef.current
    const offPitch = input.onPitch((frame) => recorder.addFrame(frame))
    const offOnset = input.onOnset((event) => recorder.addOnset(event))
    return () => {
      offPitch()
      offOnset()
    }
  }, [input, enabled])

  const begin = useCallback(() => recorderRef.current.reset(), [])

  const flush = useCallback((meta: RecordMetadata) => {
    if (!enabledRef.current) return
    void postDiagnostics(recorderRef.current.build(meta))
    recorderRef.current.reset()
  }, [])

  return { begin, flush }
}
