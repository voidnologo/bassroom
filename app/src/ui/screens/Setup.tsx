import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioEngineApi, TimeKeeper } from '../../audio/contracts'
import {
  MIN_CALIBRATION_TAPS,
  offsetFromNearestBeat,
  summarizeCalibration,
  type CalibrationResult,
  type CalibrationSample,
} from '../../audio/latency'
import { openStrings } from '../../music/fretboard'
import { noteName } from '../../music/notes'
import { useAudio } from '../../state/AudioProvider'
import { useProgressStore } from '../../state/progressStore'
import { useDiagnosticsRecorder } from '../hooks/useDiagnosticsRecorder'
import { Pill, TuningNeedle } from '../components/Indicators'

/** Input selection, tuning, and the latency measurement every timing judgment depends on. */
export function Setup() {
  const { state, devices, error, processingWarning, start, stop, refreshDevices, engine } =
    useAudio()
  const profile = useProgressStore((store) => store.snapshot.profile)
  const setPreferredDevice = useProgressStore((store) => store.setPreferredDevice)
  const [selected, setSelected] = useState(profile.preferredDeviceId ?? '')

  useEffect(() => {
    if (state === 'running') void refreshDevices()
  }, [state, refreshDevices])

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>Setup</h1>
          <p>
            Plug the bass into input 1 on the interface and raise the gain until the halo ring glows
            green when you play hard. If it flashes red the signal is clipping, and a clipped signal
            is harder to read a pitch from, not easier.
          </p>
        </div>
      </div>

      {error && <div className="banner banner-bad">{error}</div>}
      {processingWarning && <div className="banner banner-warn">{processingWarning}</div>}

      <div className="card">
        <h3>Input</h3>
        <div className="row wrap" style={{ gap: 10 }}>
          <select
            aria-label="Audio input device"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            style={{ minWidth: 280 }}
          >
            <option value="">Default input</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>

          {state === 'running' ? (
            <button type="button" className="btn" onClick={() => void stop()}>
              Stop listening
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setPreferredDevice(selected || null)
                void start(selected || undefined)
              }}
            >
              Start listening
            </button>
          )}
          <Pill tone={state === 'running' ? 'good' : 'plain'}>{state}</Pill>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Monitor yourself through the interface&apos;s own direct monitoring rather than through
          the browser. It is lower latency, and it keeps speaker output from reaching the input.
        </p>
      </div>

      <Tuner />
      <Calibration engine={engine} enabled={state === 'running'} />
    </div>
  )
}

/** Live tuning readout for all four strings. */
function Tuner() {
  const { engine, state } = useAudio()
  const [reading, setReading] = useState<{ midi: number; cents: number } | null>(null)

  useEffect(() => {
    let last = 0
    return engine.onPitch((frame) => {
      const now = performance.now()
      if (now - last < 80) return
      last = now
      setReading(frame.midi === null ? null : { midi: frame.midi, cents: frame.cents })
    })
  }, [engine])

  const strings = openStrings()
  const nearest =
    reading === null
      ? null
      : strings.reduce((best, candidate) =>
          Math.abs(candidate.midi - reading.midi) < Math.abs(best.midi - reading.midi)
            ? candidate
            : best,
        )

  return (
    <div className="card">
      <h3>Tuner</h3>
      {state !== 'running' ? (
        <p className="muted small">Start listening to use the tuner.</p>
      ) : reading === null ? (
        <p className="muted small">Play an open string.</p>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <div className="row-between">
            <span className="stat-value">{noteName(reading.midi)}</span>
            <span className="mono">{formatCents(reading.cents)}</span>
            <Pill tone={Math.abs(reading.cents) < 5 ? 'good' : 'warn'}>
              {Math.abs(reading.cents) < 5 ? 'in tune' : reading.cents > 0 ? 'sharp' : 'flat'}
            </Pill>
          </div>
          <TuningNeedle cents={reading.cents} />
          <p className="small muted">
            {nearest && reading.midi === nearest.midi
              ? `That is your ${nearest.label} string.`
              : nearest
                ? `Nearest open string is ${nearest.label}; you are ${Math.abs(reading.midi - nearest.midi)} semitones from it.`
                : ''}
          </p>
        </div>
      )}
    </div>
  )
}

const CALIBRATION_BPM = 80
const CALIBRATION_BEATS = 16
/** One bar of 4, the gap the on-screen instruction promises before counting starts. */
const CALIBRATION_COUNT_IN = 4

/**
 * Measures how long a note takes to travel from the string to this app.
 *
 * Without it, every timing judgment is wrong by a fixed amount and the app tells
 * a player who is dead on the beat that they are consistently late.
 */
function Calibration({ engine, enabled }: { engine: AudioEngineApi; enabled: boolean }) {
  const storedLatency = useProgressStore((store) => store.snapshot.profile.inputLatencyMs)
  const setLatencyMs = useProgressStore((store) => store.setLatencyMs)
  const diagnosticsEnabled = useProgressStore((store) => store.snapshot.profile.diagnosticsEnabled)
  const diagnostics = useDiagnosticsRecorder(engine, diagnosticsEnabled)

  const [running, setRunning] = useState(false)
  const [taps, setTaps] = useState(0)
  const [result, setResult] = useState<CalibrationResult | null>(null)
  const samplesRef = useRef<CalibrationSample[]>([])
  const metronomeRef = useRef<TimeKeeper | null>(null)

  const stopListeningRef = useRef<(() => void) | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Idempotent: both the onset handler and the timeout can reach it. */
  const finish = useCallback(() => {
    if (metronomeRef.current === null) return
    metronomeRef.current.dispose()
    metronomeRef.current = null
    stopListeningRef.current?.()
    stopListeningRef.current = null
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    setRunning(false)
    const summary = summarizeCalibration(samplesRef.current)
    setResult(summary)
    // The individual taps are what say whether a wide spread is one stray hit
    // or genuine unsteadiness; the summary alone cannot distinguish them.
    diagnostics.flush({
      kind: 'calibration',
      now: new Date(),
      calibration: {
        tapOffsetsMs: samplesRef.current.map((sample) =>
          Number((sample.offsetSeconds * 1000).toFixed(2)),
        ),
        offsetMs: summary.offsetMs,
        spreadMs: summary.spreadMs,
        quality: summary.quality,
      },
    })
  }, [diagnostics])

  // Leaving the screen mid-measurement used to leave the click track playing
  // and an onset listener running on whatever screen you landed on.
  useEffect(() => {
    return () => {
      metronomeRef.current?.dispose()
      metronomeRef.current = null
      stopListeningRef.current?.()
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  }, [])

  const begin = useCallback(() => {
    diagnostics.begin()
    samplesRef.current = []
    setTaps(0)
    setResult(null)
    setRunning(true)

    const metronome = engine.createTimeKeeper()
    metronomeRef.current = metronome
    metronome.start({ bpm: CALIBRATION_BPM, beatsPerBar: 4, countInBeats: CALIBRATION_COUNT_IN })
    // Asked of the clock rather than recomputed: writing the count-in length a
    // second time here would shift every sample by a beat if the two drifted,
    // and summarizeCalibration would report a confident wrong latency.
    const period = metronome.secondsPerBeat
    const bodyStart = metronome.bodyBeatToTime(0)
    const endsAt = metronome.bodyBeatToTime(CALIBRATION_BEATS)

    const off = engine.onOnset((onset) => {
      if (onset.time < bodyStart - period / 2) return
      if (onset.time > endsAt) {
        off()
        finish()
        return
      }
      samplesRef.current.push({
        offsetSeconds: offsetFromNearestBeat(onset.time, bodyStart, period),
      })
      setTaps(samplesRef.current.length)
    })

    window.setTimeout(
      () => {
        off()
        finish()
      },
      (endsAt - engine.now() + 0.4) * 1000,
    )
  }, [diagnostics, engine, finish])

  return (
    <div className="card">
      <h3>Latency</h3>
      <p className="small muted">
        Play the open E string on every click for four bars, as exactly on the beat as you can. The
        app measures how far behind the click your notes arrive and corrects for it from then on.
      </p>

      <div className="row wrap" style={{ gap: 12, marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!enabled || running}
          onClick={begin}
        >
          {running ? `Listening… ${taps} notes` : 'Measure latency'}
        </button>
        <Pill tone={storedLatency > 0 ? 'good' : 'warn'}>
          {storedLatency > 0 ? `${Math.round(storedLatency)} ms applied` : 'not measured'}
        </Pill>
      </div>

      {result && (
        <CalibrationOutcome result={result} onAccept={() => setLatencyMs(result.offsetMs)} />
      )}
    </div>
  )
}

function CalibrationOutcome({
  result,
  onAccept,
}: {
  result: CalibrationResult
  onAccept: () => void
}) {
  if (result.quality === 'insufficient') {
    return (
      <p className="banner banner-warn" style={{ marginTop: 12 }}>
        Only {result.sampleCount} notes were heard; {MIN_CALIBRATION_TAPS} are needed. Play a little
        harder, or check the gain, and run it again.
      </p>
    )
  }

  return (
    <div className="stack" style={{ marginTop: 12, gap: 10 }}>
      <div className="row wrap" style={{ gap: 14 }}>
        <span className="mono">{Math.round(result.offsetMs)} ms behind the click</span>
        <span className="small faint mono">spread ±{Math.round(result.spreadMs)} ms</span>
      </div>
      {result.quality === 'noisy' && (
        <p className="banner banner-warn small">
          Your taps varied by {Math.round(result.spreadMs)} ms, which is wider than the delay being
          measured. That is a steadiness problem rather than a latency one. The figure will still
          help, but run it again after some metronome practice.
        </p>
      )}
      <button type="button" className="btn" onClick={onAccept}>
        Use {Math.round(result.offsetMs)} ms
      </button>
    </div>
  )
}

function formatCents(cents: number): string {
  if (Math.abs(cents) < 1) return '0 cents'
  return `${cents > 0 ? '+' : ''}${Math.round(cents)} cents`
}
